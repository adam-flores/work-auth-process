import type { DatabaseSync } from "node:sqlite";
import { readFixture } from "./fixture.ts";
import { transform } from "./transform.ts";

/**
 * Write the transformed hierarchy into the store. Called inside the store's
 * seeding transaction, so a failed transformation leaves no half-built tree.
 *
 * Order matters: `PRAGMA foreign_keys` is on, so a division cannot be inserted
 * before its legal entity. That is the point of having the foreign keys.
 */
export function seedHierarchy(db: DatabaseSync, fixturePath?: string): void {
  const hierarchy = transform(readFixture(fixturePath));

  db.exec("DELETE FROM department_codes");
  db.exec("DELETE FROM hierarchy_attributes");
  db.exec("DELETE FROM departments");
  db.exec("DELETE FROM divisions");
  db.exec("DELETE FROM legal_entities");

  const insertEntity = db.prepare(
    "INSERT INTO legal_entities (id, name, active) VALUES (?, ?, ?)",
  );
  for (const entity of hierarchy.legalEntities) {
    insertEntity.run(entity.id, entity.name, entity.active ? 1 : 0);
  }

  const insertDivision = db.prepare(
    "INSERT INTO divisions (id, legal_entity_id, name, active) VALUES (?, ?, ?, ?)",
  );
  for (const division of hierarchy.divisions) {
    insertDivision.run(division.id, division.legalEntityId, division.name, division.active ? 1 : 0);
  }

  const insertDepartment = db.prepare(
    `INSERT INTO departments (id, division_id, name, active, heritage, disclosure_treatment)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const department of hierarchy.departments) {
    insertDepartment.run(
      department.id,
      department.divisionId,
      department.name,
      department.active ? 1 : 0,
      department.heritage,
      department.disclosureTreatment,
    );
  }

  const insertAttribute = db.prepare(
    "INSERT INTO hierarchy_attributes (node_kind, node_id, name, value) VALUES (?, ?, ?, ?)",
  );
  for (const a of hierarchy.attributes) {
    insertAttribute.run(a.nodeKind, a.nodeId, a.name, a.value);
  }

  const insertCode = db.prepare(
    "INSERT INTO department_codes (department_id, kind, code, shared) VALUES (?, ?, ?, ?)",
  );
  for (const c of hierarchy.codes) {
    insertCode.run(c.departmentId, c.kind, c.code, c.shared ? 1 : 0);
  }
}
