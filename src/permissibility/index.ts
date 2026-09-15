import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Jurisdiction } from "../shared/constants.ts";
import type { ResolvedDepartment } from "../hierarchy/index.ts";

/**
 * Permissibility (#53, BDR-0007): a configurable list of disallowed
 * jurisdiction pairings, checked at entry rather than at a gate days later.
 * The list is data, so a new pairing costs no build - an Administrator
 * maintains it through the service seam below, the same discipline the
 * hierarchy's reference data follows (ADR-0011).
 *
 * As with drafts and the hierarchy, the service module owns validation;
 * everything here takes and returns already-trusted values.
 */

export type PermissibilityRule = {
  id: string;
  requestingJurisdiction: Jurisdiction;
  performingJurisdiction: Jurisdiction;
};

type RuleRow = { id: string; requesting_jurisdiction: string; performing_jurisdiction: string };

function rowToRule(row: RuleRow): PermissibilityRule {
  return {
    id: row.id,
    requestingJurisdiction: row.requesting_jurisdiction as Jurisdiction,
    performingJurisdiction: row.performing_jurisdiction as Jurisdiction,
  };
}

function insertRule(
  db: DatabaseSync,
  rule: { requestingJurisdiction: Jurisdiction; performingJurisdiction: Jurisdiction },
): PermissibilityRule {
  const id = `permissibility-rule-${randomUUID()}`;
  db.prepare(
    "INSERT INTO permissibility_rules (id, requesting_jurisdiction, performing_jurisdiction) VALUES (?, ?, ?)",
  ).run(id, rule.requestingJurisdiction, rule.performingJurisdiction);
  return { id, ...rule };
}

function findRuleByPairing(
  db: DatabaseSync,
  requestingJurisdiction: Jurisdiction,
  performingJurisdiction: Jurisdiction,
): PermissibilityRule | null {
  const row = db
    .prepare(
      "SELECT id, requesting_jurisdiction, performing_jurisdiction FROM permissibility_rules " +
        "WHERE requesting_jurisdiction = ? AND performing_jurisdiction = ?",
    )
    .get(requestingJurisdiction, performingJurisdiction) as RuleRow | undefined;
  return row ? rowToRule(row) : null;
}

/** Seeded once, at store build (BDR-0007): "a foreign department may not
 *  perform work for a domestic one." Called inside the store's seeding
 *  transaction, the same as `seedHierarchy`. */
export function seedPermissibilityRules(db: DatabaseSync): void {
  db.exec("DELETE FROM permissibility_rules");
  insertRule(db, { requestingJurisdiction: "domestic", performingJurisdiction: "foreign" });
}

/** The whole list, in the order added - short enough to show as a list
 *  (BDR-0007), not paged or filtered. */
export function listPermissibilityRules(db: DatabaseSync): PermissibilityRule[] {
  const rows = db
    .prepare("SELECT id, requesting_jurisdiction, performing_jurisdiction FROM permissibility_rules ORDER BY rowid")
    .all() as RuleRow[];
  return rows.map(rowToRule);
}

export function permissibilityRuleExists(db: DatabaseSync, ruleId: string): boolean {
  return db.prepare("SELECT 1 FROM permissibility_rules WHERE id = ?").get(ruleId) !== undefined;
}

/** Adding an already-present pairing is not an error - it returns the
 *  existing rule rather than a second row the unique constraint would
 *  refuse anyway, so an Administrator re-adding one by mistake is a no-op,
 *  not a failure. */
export function addPermissibilityRule(
  db: DatabaseSync,
  rule: { requestingJurisdiction: Jurisdiction; performingJurisdiction: Jurisdiction },
): PermissibilityRule {
  const existing = findRuleByPairing(db, rule.requestingJurisdiction, rule.performingJurisdiction);
  return existing ?? insertRule(db, rule);
}

export function removePermissibilityRule(db: DatabaseSync, ruleId: string): void {
  db.prepare("DELETE FROM permissibility_rules WHERE id = ?").run(ruleId);
}

/** A department's `jurisdiction` attribute (ADR-0012) - the one attribute
 *  permissibility is evaluated against - or null where the fixture cannot
 *  classify it. That department is seeded inactive (ADR-0012), so the rule
 *  is never asked a question it cannot answer: a missing jurisdiction on
 *  either side means nothing is refused, not that everything is. */
function jurisdictionOf(department: ResolvedDepartment): Jurisdiction | null {
  const attribute = department.attributes.find((a) => a.name === "jurisdiction");
  return attribute ? (attribute.value as Jurisdiction) : null;
}

/** Whether an authorization from `requesting` to `performing` is allowed to
 *  be entered at all (#53). Direction matters - checked as the requesting
 *  side's jurisdiction paired with the performing side's, not the reverse. */
export function isPairingPermitted(
  db: DatabaseSync,
  requesting: ResolvedDepartment,
  performing: ResolvedDepartment,
): boolean {
  const requestingJurisdiction = jurisdictionOf(requesting);
  const performingJurisdiction = jurisdictionOf(performing);
  if (!requestingJurisdiction || !performingJurisdiction) return true;
  return findRuleByPairing(db, requestingJurisdiction, performingJurisdiction) === null;
}
