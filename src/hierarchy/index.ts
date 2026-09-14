import type { DatabaseSync } from "node:sqlite";
import type { CodeKind, NodeKind } from "./transform.ts";
import type { DepartmentQuery } from "../shared/rules.ts";

/**
 * Reading the hierarchy: resolve a department to its three levels, narrow on
 * attributes, search what remains by name (BDR-0008).
 *
 * The hierarchy is small enough - one organization's departments - that every
 * read loads it whole and folds in TypeScript rather than composing SQL. That is
 * ADR-0008's position, where the store is there for the atomic ordered append
 * and aggregates are folds, and it keeps the filter combinations, which are
 * arbitrary by design, out of a query builder.
 */

export type { CodeKind, NodeKind } from "./transform.ts";

/**
 * An attribute as a department reads it, with every level that holds it. The
 * same attribute genuinely hangs at two levels in this data, and which level
 * holds it is what an Administrator needs to know to change it.
 */
export type Attribute = {
  name: string;
  value: string;
  heldAt: NodeKind[];
};

export type DepartmentCode = {
  kind: CodeKind;
  code: string;
  /** Not held by this department alone, so it cannot be read as identifying it. */
  shared: boolean;
};

export type HierarchyNode = { id: string; name: string; active: boolean };

export type ResolvedDepartment = {
  id: string;
  name: string;
  /** The department's own flag. */
  active: boolean;
  /** Active, and every level above it active too: whether a new authorization
   *  may name it. Inactive at any level closes what is beneath it (BDR-0010). */
  selectable: boolean;
  division: HierarchyNode;
  legalEntity: HierarchyNode;
  /** Its own attributes plus every attribute held above it. */
  attributes: Attribute[];
  /** Detail. Recorded and shown; never an identifier and never a filter. */
  codes: DepartmentCode[];
  heritage: string | null;
  disclosureTreatment: string | null;
};

type EntityRow = { id: string; name: string; active: number };
type DivisionRow = { id: string; legal_entity_id: string; name: string; active: number };
type DepartmentRow = {
  id: string;
  division_id: string;
  name: string;
  active: number;
  heritage: string | null;
  disclosure_treatment: string | null;
};
type AttributeRow = { node_kind: NodeKind; node_id: string; name: string; value: string };
type CodeRow = { department_id: string; kind: CodeKind; code: string; shared: number };

const LEVELS: NodeKind[] = ["legal-entity", "division", "department"];

/** Rows to a map of lists, keyed by whatever `keyOf` says. */
function groupBy<Row>(rows: Row[], keyOf: (row: Row) => string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/** Ordered legal entity first, so `heldAt` reads down the tree. */
function mergeAttributes(rows: { kind: NodeKind; name: string; value: string }[]): Attribute[] {
  const merged = new Map<string, Attribute>();
  for (const row of rows) {
    const key = `${row.name}=${row.value}`;
    const existing = merged.get(key);
    if (existing) existing.heldAt.push(row.kind);
    else merged.set(key, { name: row.name, value: row.value, heldAt: [row.kind] });
  }
  for (const attribute of merged.values()) {
    attribute.heldAt.sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
  }
  return [...merged.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value),
  );
}

/**
 * Every department in the store, resolved. Ordered by name: the picker shows a
 * list a person reads, so a stable order is part of the behaviour.
 */
export function readDepartments(db: DatabaseSync): ResolvedDepartment[] {
  const entities = db.prepare("SELECT id, name, active FROM legal_entities").all() as EntityRow[];
  const divisions = db
    .prepare("SELECT id, legal_entity_id, name, active FROM divisions")
    .all() as DivisionRow[];
  const departments = db
    .prepare(
      `SELECT id, division_id, name, active, heritage, disclosure_treatment
       FROM departments`,
    )
    .all() as DepartmentRow[];
  const attributes = db
    .prepare("SELECT node_kind, node_id, name, value FROM hierarchy_attributes")
    .all() as AttributeRow[];
  const codes = db
    .prepare("SELECT department_id, kind, code, shared FROM department_codes ORDER BY kind, code")
    .all() as CodeRow[];

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const divisionById = new Map(divisions.map((d) => [d.id, d]));

  const attributesFor = groupBy(attributes, (row) => `${row.node_kind}:${row.node_id}`);
  const codesFor = groupBy(codes, (row) => row.department_id);

  // Ordered here rather than in SQL: SQLite compares bytes, which files every
  // name beginning "CAL" ahead of every name beginning "Cab". A person reading
  // the list expects one C.
  departments.sort((a, b) => a.name.localeCompare(b.name));

  return departments.map((department) => {
    const division = divisionById.get(department.division_id);
    const entity = division ? entityById.get(division.legal_entity_id) : undefined;
    if (!division || !entity) {
      // Foreign keys make this unreachable; it is here so that if the schema
      // ever loses them, seeding fails loudly rather than dropping a department.
      throw new Error(`Department "${department.id}" does not resolve to three levels.`);
    }

    const own = (kind: NodeKind, id: string) =>
      (attributesFor.get(`${kind}:${id}`) ?? []).map((row) => ({
        kind,
        name: row.name,
        value: row.value,
      }));

    const active = department.active === 1;
    return {
      id: department.id,
      name: department.name,
      active,
      selectable: active && division.active === 1 && entity.active === 1,
      division: { id: division.id, name: division.name, active: division.active === 1 },
      legalEntity: { id: entity.id, name: entity.name, active: entity.active === 1 },
      attributes: mergeAttributes([
        ...own("legal-entity", entity.id),
        ...own("division", division.id),
        ...own("department", department.id),
      ]),
      codes: (codesFor.get(department.id) ?? []).map((row) => ({
        kind: row.kind,
        code: row.code,
        shared: row.shared === 1,
      })),
      heritage: department.heritage,
      disclosureTreatment: department.disclosure_treatment,
    };
  });
}

/**
 * Narrow on any attributes in any combination, then search what remains by name.
 * No filter is required and none is privileged: certain of nothing is a legal
 * starting state (BDR-0008).
 */
export function findDepartments(
  db: DatabaseSync,
  query: DepartmentQuery,
): ResolvedDepartment[] {
  const text = query.text.trim().toLowerCase();

  return readDepartments(db).filter((department) => {
    if (!query.includeInactive && !department.selectable) return false;
    if (query.legalEntityId && department.legalEntity.id !== query.legalEntityId) return false;
    if (query.divisionId && department.division.id !== query.divisionId) return false;
    if (text && !department.name.toLowerCase().includes(text)) return false;

    // Filters narrow: a department must carry every one of them.
    return query.attributes.every((filter) =>
      department.attributes.some((a) => a.name === filter.name && a.value === filter.value),
    );
  });
}

/** Resolvable for ever, active or not - which is why nothing is ever deleted. */
export function resolveDepartment(
  db: DatabaseSync,
  departmentId: string,
): ResolvedDepartment | null {
  return readDepartments(db).find((department) => department.id === departmentId) ?? null;
}
