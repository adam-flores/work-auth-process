import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Fixture } from "../../src/hierarchy/fixture.ts";
import { transform } from "../../src/hierarchy/transform.ts";
import type { SeedHierarchy } from "../../src/hierarchy/transform.ts";

/**
 * `transform()` (ADR-0012), driven directly against the original
 * 58-department fixture rather than through a seeded store.
 *
 * `docs/reference/demo-hierarchy.json` (ADR-0013) is what actually seeds a
 * running store now, and it was authored fresh rather than transcribed - it
 * has no conflated code column, no comma-separated codes, and no shared cost
 * centre, so `tests/service/hierarchy.test.ts` never exercises the branches
 * of `transform()` that handle those. This file keeps that coverage by
 * calling `transform()` against `docs/reference/organization-hierarchy.json`
 * directly - the fixture stays in the repository as ADR-0012's historical
 * record specifically so this remains possible.
 *
 * Below the service seam deliberately: nothing here needs a store, a
 * participant, or a command surface, only the pure function ADR-0012 decided
 * the shape of.
 */

const LEGACY_FIXTURE_PATH = new URL(
  "../../docs/reference/organization-hierarchy.json",
  import.meta.url,
);

function seedLegacyHierarchy(): SeedHierarchy {
  const fixture = Fixture.parse(JSON.parse(readFileSync(LEGACY_FIXTURE_PATH, "utf8")) as unknown);
  return transform(fixture);
}

describe("transform() against the original 58-department fixture", () => {
  test("produces the fixture's own counts", () => {
    const hierarchy = seedLegacyHierarchy();
    assert.equal(hierarchy.legalEntities.length, 3);
    assert.equal(hierarchy.divisions.length, 12);
    assert.equal(hierarchy.departments.length, 58);
  });

  test("a cost centre shared by four departments identifies none of them", () => {
    const hierarchy = seedLegacyHierarchy();
    const holders = hierarchy.codes.filter((c) => c.code === "20514");
    assert.equal(holders.length, 4);
    assert.equal(new Set(holders.map((c) => c.departmentId)).size, 4);
    // The source marked every one of the four as sole, which is the marking
    // the transformation refuses to carry.
    for (const code of holders) {
      assert.equal(code.shared, true, `${code.departmentId} should not claim 20514 alone`);
    }
  });

  test("two departments with an identical code set keep their different disclosure treatments", () => {
    const hierarchy = seedLegacyHierarchy();
    const codesOf = (id: string) =>
      hierarchy.codes
        .filter((c) => c.departmentId === id && c.kind === "cost-center")
        .map((c) => c.code)
        .sort();

    const defense = hierarchy.departments.find((d) => d.name === "Thermal Defense Products")!;
    const commercial = hierarchy.departments.find((d) => d.name === "Thermal Commercial Ent.")!;

    assert.deepEqual(codesOf(defense.id), codesOf(commercial.id));
    assert.notEqual(defense.disclosureTreatment, commercial.disclosureTreatment);
  });

  test("a department with no code at all is seeded and usable", () => {
    const hierarchy = seedLegacyHierarchy();
    const noCodes = hierarchy.departments.find((d) => d.name === "Cabin Equipment - Central Engineering")!;
    assert.deepEqual(
      hierarchy.codes.filter((c) => c.departmentId === noCodes.id),
      [],
    );
    assert.equal(noCodes.disclosureTreatment, null);
    assert.equal(noCodes.active, true);
  });

  test("the literal code 'various cost centers' is not carried as a code", () => {
    const hierarchy = seedLegacyHierarchy();
    const allocated = hierarchy.departments.find((d) => d.name === "Allocated Function")!;
    assert.deepEqual(
      hierarchy.codes.filter((c) => c.departmentId === allocated.id),
      [],
    );

    for (const code of hierarchy.codes) {
      assert.ok(!/various/i.test(code.code), `carries the code "${code.code}"`);
    }
  });

  test("three codes crammed into one field become three codes", () => {
    const hierarchy = seedLegacyHierarchy();
    const vantara = hierarchy.departments.find((d) => d.name === "Vantara Design Center (Vantara, Selkirk)")!;
    assert.deepEqual(
      hierarchy.codes
        .filter((c) => c.departmentId === vantara.id)
        .map((c) => c.code)
        .sort(),
      ["D204", "D209", "D216"],
    );
  });

  test("a cost centre shared with another division is marked as shared", () => {
    const hierarchy = seedLegacyHierarchy();
    const inertial = hierarchy.departments.find((d) => d.name === "Inertial Reference Systems")!;
    const codes = hierarchy.codes.filter((c) => c.departmentId === inertial.id);
    assert.equal(codes.length, 7, "six cost centres and one cost-accounting code");
    assert.equal(codes.filter((c) => c.shared).length, 1);
  });

  test("near-identical sibling names stay distinct departments", () => {
    const hierarchy = seedLegacyHierarchy();
    const hubs = hierarchy.departments.filter((d) => d.name.startsWith("Rotor Hubs"));
    assert.equal(hubs.length, 3);
    assert.equal(new Set(hubs.map((d) => d.id)).size, 3);
  });

  test("a collision between two nodes claiming the same id is thrown rather than merged", () => {
    const fixture = Fixture.parse(JSON.parse(readFileSync(LEGACY_FIXTURE_PATH, "utf8")) as unknown);
    const duplicated = structuredClone(fixture);
    const firstEntity = duplicated.legalEntities[0]!;
    const firstDivision = firstEntity.divisions[0]!;
    const firstDepartment = firstDivision.departments[0]!;
    firstDivision.departments.push({ ...firstDepartment });

    assert.throws(() => transform(duplicated), /same id/);
  });

  test("CAL's single conflated code column is read as a cost-accounting code", () => {
    const hierarchy = seedLegacyHierarchy();
    const thermalCyclingLab = hierarchy.departments.find((d) => d.name === "Thermal Cycling Lab");
    assert.ok(thermalCyclingLab, "expected a department from the CAL-shaped legal entity");
    const codes = hierarchy.codes.filter((c) => c.departmentId === thermalCyclingLab!.id);
    assert.deepEqual(codes.map((c) => c.code), ["L740"]);
    assert.ok(codes.every((c) => c.kind === "cost-accounting"));
  });

  test("a department the fixture cannot classify is seeded inactive rather than guessed at", () => {
    const hierarchy = seedLegacyHierarchy();
    const undetermined = hierarchy.departments.filter(
      (d) => !hierarchy.attributes.some((a) => a.nodeId === d.id && a.name === "jurisdiction"),
    );
    assert.equal(undetermined.length, 1);
    assert.equal(undetermined[0]?.active, false);
  });
});
