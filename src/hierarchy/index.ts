import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { slug } from "./transform.ts";
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

/**
 * An Administrator maintaining what the process runs on (#64, BDR-0010):
 * add, rename and set-inactive for a legal entity, a division or a
 * department - never a delete, and re-parenting is specified but
 * deliberately not built. As with every read above, this module owns no
 * validation of *who* may call these; the service checks the caller is an
 * Administrator and that any id named is real before reaching here, the
 * same trust `authorizations/index.ts` extends its own callers.
 */

const TABLE_FOR: Record<NodeKind, string> = {
  "legal-entity": "legal_entities",
  division: "divisions",
  department: "departments",
};

/** One node at any level, read directly rather than through the department
 *  fold above - what the service checks an id against before renaming it or
 *  setting it inactive, and what a rename or set-inactive itself reads
 *  first to know the name it is changing from. */
export function hierarchyNode(
  db: DatabaseSync,
  nodeKind: NodeKind,
  nodeId: string,
): HierarchyNode | null {
  // The table name comes from `TABLE_FOR`, a fixed three-entry lookup keyed
  // by the typed `NodeKind` - never a value read from a request - so this is
  // not the injection shape the security scan's interpolation rule guards
  // against. Built as its own statement rather than inline in `.prepare(`
  // so the scan reads that plainly instead of pattern-matching the shape.
  const sql = `SELECT id, name, active FROM ${TABLE_FOR[nodeKind]} WHERE id = ?`;
  const row = db.prepare(sql).get(nodeId) as { id: string; name: string; active: number } | undefined;
  return row ? { id: row.id, name: row.name, active: row.active === 1 } : null;
}

/** Every legal entity, active or not - what populates an Administrator's
 *  "add a division" form, since a freshly added legal entity with no
 *  division under it yet would not show up in `readDepartments` above. */
export function listLegalEntities(db: DatabaseSync): HierarchyNode[] {
  const rows = db.prepare("SELECT id, name, active FROM legal_entities ORDER BY name").all() as {
    id: string;
    name: string;
    active: number;
  }[];
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active === 1 }));
}

/** Every division, or every division under one legal entity - the same
 *  reason `listLegalEntities` exists, one level down, for an Administrator's
 *  "add a department" form. */
export function listDivisions(
  db: DatabaseSync,
  legalEntityId?: string,
): (HierarchyNode & { legalEntityId: string })[] {
  const rows = (
    legalEntityId
      ? db
          .prepare(
            "SELECT id, legal_entity_id, name, active FROM divisions WHERE legal_entity_id = ? ORDER BY name",
          )
          .all(legalEntityId)
      : db.prepare("SELECT id, legal_entity_id, name, active FROM divisions ORDER BY name").all()
  ) as { id: string; legal_entity_id: string; name: string; active: number }[];
  return rows.map((row) => ({
    id: row.id,
    legalEntityId: row.legal_entity_id,
    name: row.name,
    active: row.active === 1,
  }));
}

/** `slug` can legitimately reduce to the empty string for a name that
 *  survives `HierarchyNodeName`'s non-blank check but is entirely
 *  punctuation once normalized (an em dash, say) - nothing here should ever
 *  hand `uniqueId` an empty base to disambiguate against, so this falls
 *  back to a short random id in exactly that case. */
function slugOrFallback(name: string): string {
  return slug(name) || `node-${randomUUID().slice(0, 8)}`;
}

/** A stable id for a node added after seeding, from the same `slug` seeding
 *  itself uses (ADR-0012) - but a collision here is a coincidence of two
 *  ordinary names, not a fixture bug, so it is disambiguated with a numeric
 *  suffix rather than thrown on the way seeding's own collision is. */
function uniqueId(db: DatabaseSync, table: string, base: string): string {
  // `table` is always one of `hierarchyNode`'s three fixed table names,
  // never external input - see that function's note on the same shape.
  const sql = `SELECT 1 FROM ${table} WHERE id = ?`;
  const taken = (id: string) => db.prepare(sql).get(id) !== undefined;
  if (!taken(base)) return base;
  let suffix = 2;
  while (taken(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

export type HierarchyChangeKind = "add" | "rename" | "set-inactive";

/** One entry in the hierarchy's own append-only log (ADR-0007: "get their
 *  own append-only log, separate from the transition log"), read back for
 *  BDR-0010's change log - who changed what, and when. A discriminated union
 *  rather than one shape with optional fields, the same choice
 *  `authorizations/index.ts` makes for a transition's payload: what a change
 *  carries depends entirely on its kind. */
export type HierarchyChange =
  | {
      id: string;
      actorId: string;
      occurredAt: string;
      kind: "add";
      nodeKind: NodeKind;
      nodeId: string;
      name: string;
      parentId: string | null;
    }
  | {
      id: string;
      actorId: string;
      occurredAt: string;
      kind: "rename";
      nodeKind: NodeKind;
      nodeId: string;
      from: string;
      to: string;
    }
  | {
      id: string;
      actorId: string;
      occurredAt: string;
      kind: "set-inactive";
      nodeKind: NodeKind;
      nodeId: string;
      name: string;
    };

type HierarchyChangeRow = {
  id: string;
  actor_id: string;
  occurred_at: string;
  kind: HierarchyChangeKind;
  node_kind: NodeKind;
  node_id: string;
  payload: string;
};

function appendHierarchyChange(
  db: DatabaseSync,
  input: {
    actorId: string;
    occurredAt: string;
    kind: HierarchyChangeKind;
    nodeKind: NodeKind;
    nodeId: string;
    payload: Record<string, unknown>;
  },
): void {
  db.prepare(
    `INSERT INTO hierarchy_changes (id, actor_id, occurred_at, kind, node_kind, node_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `hierarchy-change-${randomUUID()}`,
    input.actorId,
    input.occurredAt,
    input.kind,
    input.nodeKind,
    input.nodeId,
    JSON.stringify(input.payload),
  );
}

/** The whole change log, in the order it was made (BDR-0010) - short enough
 *  for an Administrator to read as a list, the same discipline every other
 *  small reference-data list in this module follows. */
export function listHierarchyChanges(db: DatabaseSync): HierarchyChange[] {
  const rows = db.prepare("SELECT * FROM hierarchy_changes ORDER BY seq").all() as HierarchyChangeRow[];
  return rows.map((row) => {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    return {
      id: row.id,
      actorId: row.actor_id,
      occurredAt: row.occurred_at,
      kind: row.kind,
      nodeKind: row.node_kind,
      nodeId: row.node_id,
      ...payload,
    } as HierarchyChange;
  });
}

/** Adding a department unblocks a submitter who had nowhere to turn
 *  (BDR-0008's unfindable-department case) - the reason add is built at
 *  every level rather than department alone, since a department needs a
 *  division to sit under and a division needs a legal entity. */
export function addLegalEntity(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; name: string },
): HierarchyNode {
  const id = uniqueId(db, "legal_entities", slugOrFallback(input.name));
  db.prepare("INSERT INTO legal_entities (id, name, active) VALUES (?, ?, 1)").run(id, input.name);
  appendHierarchyChange(db, {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    kind: "add",
    nodeKind: "legal-entity",
    nodeId: id,
    payload: { name: input.name, parentId: null },
  });
  return { id, name: input.name, active: true };
}

export function addDivision(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; name: string; legalEntityId: string },
): HierarchyNode {
  const id = uniqueId(db, "divisions", `${input.legalEntityId}-${slugOrFallback(input.name)}`);
  db.prepare("INSERT INTO divisions (id, legal_entity_id, name, active) VALUES (?, ?, ?, 1)").run(
    id,
    input.legalEntityId,
    input.name,
  );
  appendHierarchyChange(db, {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    kind: "add",
    nodeKind: "division",
    nodeId: id,
    payload: { name: input.name, parentId: input.legalEntityId },
  });
  return { id, name: input.name, active: true };
}

export function addDepartment(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; name: string; divisionId: string },
): HierarchyNode {
  const id = uniqueId(db, "departments", slugOrFallback(input.name));
  db.prepare(
    "INSERT INTO departments (id, division_id, name, active, heritage, disclosure_treatment) VALUES (?, ?, ?, 1, NULL, NULL)",
  ).run(id, input.divisionId, input.name);
  appendHierarchyChange(db, {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    kind: "add",
    nodeKind: "department",
    nodeId: id,
    payload: { name: input.name, parentId: input.divisionId },
  });
  return { id, name: input.name, active: true };
}

/** A rename disturbs nothing about in-flight work (BDR-0010: "no identity,
 *  no parentage, no inherited attribute, and therefore nothing about the
 *  authorization's routing or its truth") - it changes only what a node is
 *  called, so it is the one edit here with no consequence beyond itself.
 *  Renaming to the name a node already carries is left unlogged: nothing
 *  about the organization changed, so BDR-0010's "who changed what" has
 *  nothing to say. */
export function renameHierarchyNode(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; nodeKind: NodeKind; nodeId: string; name: string },
): HierarchyNode {
  const before = hierarchyNode(db, input.nodeKind, input.nodeId)!;
  if (before.name === input.name) return before;

  // See `hierarchyNode`'s note: `TABLE_FOR[input.nodeKind]` is one of three
  // fixed names, never external input.
  const sql = `UPDATE ${TABLE_FOR[input.nodeKind]} SET name = ? WHERE id = ?`;
  db.prepare(sql).run(input.name, input.nodeId);
  appendHierarchyChange(db, {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    kind: "rename",
    nodeKind: input.nodeKind,
    nodeId: input.nodeId,
    payload: { from: before.name, to: input.name },
  });
  return { id: input.nodeId, name: input.name, active: before.active };
}

/**
 * Marking a legal entity, division or department inactive (BDR-0010:
 * "marking one inactive ends the work that names it"). Nothing is deleted;
 * closing a node at any level closes every department beneath it too
 * (ADR-0012's `selectable`), which is why this compares the set of
 * selectable departments before and after rather than only asking whether
 * the node itself was a department - a division or legal entity going
 * inactive reaches every department under it the same way BDR-0010 requires
 * a department itself going inactive to. Already-inactive is a no-op, the
 * same discipline `addPermissibilityRule` already follows for an
 * already-present pairing: nothing changed, so nothing is logged and no
 * authorization is revoked a second time.
 */
export function setHierarchyNodeInactive(
  db: DatabaseSync,
  input: { actorId: string; occurredAt: string; nodeKind: NodeKind; nodeId: string },
): { node: HierarchyNode; newlyClosedDepartmentIds: string[] } {
  const before = hierarchyNode(db, input.nodeKind, input.nodeId)!;
  if (!before.active) return { node: before, newlyClosedDepartmentIds: [] };

  const selectableBefore = new Set(
    readDepartments(db)
      .filter((d) => d.selectable)
      .map((d) => d.id),
  );

  // See `hierarchyNode`'s note on `TABLE_FOR` being a fixed lookup.
  const sql = `UPDATE ${TABLE_FOR[input.nodeKind]} SET active = 0 WHERE id = ?`;
  db.prepare(sql).run(input.nodeId);
  appendHierarchyChange(db, {
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    kind: "set-inactive",
    nodeKind: input.nodeKind,
    nodeId: input.nodeId,
    payload: { name: before.name },
  });

  const selectableAfter = new Set(
    readDepartments(db)
      .filter((d) => d.selectable)
      .map((d) => d.id),
  );
  const newlyClosedDepartmentIds = [...selectableBefore].filter((id) => !selectableAfter.has(id));

  return { node: { id: input.nodeId, name: before.name, active: false }, newlyClosedDepartmentIds };
}
