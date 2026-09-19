import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import type { ResolvedDepartment } from "../../src/hierarchy/index.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The hierarchy, driven at the service seam (ADR-0010). Nothing here asserts
 * against the tables: how the transformation stores an attribute is
 * implementation, and what a submitter can find is the behaviour. Two tests
 * close a department or a division through the real Administrator command
 * (#64) rather than editing the store directly, and restore the seeded
 * hierarchy afterwards with a full reset - set-inactive has no reverse of its
 * own, by design (BDR-0010 names add and rename as the only edits, not a
 * reactivation), so a reseed is what undoes it for the tests below.
 *
 * The fixture these run against is `docs/reference/demo-hierarchy.json`
 * (ADR-0013), the small catalog sized for a live demo. `transform()`'s
 * handling of the original 58-department fixture's irregularities - a shared
 * cost centre, a conflated code column, near-identical sibling names - has no
 * equivalent here by design (#92) and is covered instead, directly against
 * `docs/reference/organization-hierarchy.json`, by
 * `tests/service/legacy-fixture-transform.test.ts`.
 */

const SYSTEM = { participantId: "system" };

/** The demo catalog's own counts (docs/reference/demo-hierarchy.json). */
const FIXTURE = { legalEntities: 1, divisions: 2, departments: 5, foreign: 2 };

describe("the seeded hierarchy", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let administrator: { participantId: string };

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    administrator = {
      participantId: service.listParticipants(SYSTEM).find((p) => p.role === "Administrator")!.id,
    };
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  /** Everything, active or not. The seed's whole population. */
  const all = (): ResolvedDepartment[] =>
    service.searchDepartments(SYSTEM, { includeInactive: true });

  const byName = (name: string): ResolvedDepartment => {
    const found = all().find((d) => d.name === name);
    assert.ok(found, `no seeded department named "${name}"`);
    return found;
  };

  describe("the three levels", () => {
    test("every department in the fixture resolves to exactly one division and one legal entity", () => {
      const departments = all();
      assert.equal(departments.length, FIXTURE.departments);

      for (const d of departments) {
        assert.ok(d.division.id.length > 0, `${d.name} has no division`);
        assert.ok(d.legalEntity.id.length > 0, `${d.name} has no legal entity`);
      }

      assert.equal(new Set(departments.map((d) => d.division.id)).size, FIXTURE.divisions);
      assert.equal(new Set(departments.map((d) => d.legalEntity.id)).size, FIXTURE.legalEntities);
    });

    test("a department id identifies one department, and resolves to the same record the search returned", () => {
      const departments = all();
      assert.equal(new Set(departments.map((d) => d.id)).size, departments.length);

      for (const d of departments) {
        assert.deepEqual(service.getDepartment(SYSTEM, d.id), d);
      }
    });

    test("the two levels above a department are derived, never keyed", () => {
      // The point of BDR-0008: the picker resolves a department and the levels
      // above it come with it.
      const rotorAssemblies = byName("Rotor Assemblies");
      assert.equal(rotorAssemblies.division.name, "Structures");
      assert.equal(rotorAssemblies.legalEntity.name, "Calderis Aerospace");
    });

    test("an unknown department id is refused rather than guessed at", () => {
      assert.throws(() => service.getDepartment(SYSTEM, "no-such-department"), {
        code: "UNKNOWN_DEPARTMENT",
      });
    });
  });

  describe("attributes and inheritance", () => {
    test("a department reads its own attributes plus every attribute above it", () => {
      // Own (department-level), plus its legal entity's - the full three-level
      // chain the schema supports, even with only one legal entity in this
      // catalog.
      const heatShielding = byName("Heat Shielding");
      const names = heatShielding.attributes.map((a) => a.name);
      assert.ok(names.includes("jurisdiction"));
      assert.ok(names.includes("offshore-shared-service"));

      const affiliation = heatShielding.attributes.find((a) => a.name === "affiliation");
      assert.ok(affiliation, "every department should inherit the legal entity's affiliation");
      assert.deepEqual(affiliation.heldAt, ["legal-entity"]);
    });

    test("an attribute held at the division is inherited by a department that carries nothing of its own for it", () => {
      // Flight Controls Software carries no home-office-disclosure of its
      // own; it is reachable by it only because Avionics, its division,
      // holds it - the inheritance case ADR-0012's consequences call out.
      const flightControls = byName("Flight Controls Software");
      const homeOffice = flightControls.attributes.find((a) => a.name === "home-office-disclosure");
      assert.ok(homeOffice, "Flight Controls Software should inherit home-office-disclosure from its division");
      assert.deepEqual(homeOffice.heldAt, ["division"]);
    });

    test("no attribute is listed twice, however many levels hold it", () => {
      for (const d of all()) {
        const pairs = d.attributes.map((a) => `${a.name}=${a.value}`);
        assert.equal(new Set(pairs).size, pairs.length, `${d.name} lists an attribute twice`);
      }
    });

    test("filtering finds a department by an attribute its division holds", () => {
      // Sensor Integration holds nothing of its own for this attribute; it
      // matches only through inheritance from Avionics.
      const found = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "home-office-disclosure", value: "included" }],
      });
      assert.ok(found.some((d) => d.name === "Sensor Integration"));
      assert.ok(found.some((d) => d.name === "Flight Controls Software"));
    });
  });

  describe("foreign and domestic", () => {
    test("it survives as an attribute rather than a position in the hierarchy", () => {
      const foreign = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "jurisdiction", value: "foreign" }],
      });
      assert.equal(foreign.length, FIXTURE.foreign);

      // Scattered, not grouped: a foreign and a domestic department sit
      // side by side in the same division.
      const structures = all().filter((d) => d.division.name === "Structures");
      const jurisdictions = new Set(
        structures.flatMap((d) =>
          d.attributes.filter((a) => a.name === "jurisdiction").map((a) => a.value),
        ),
      );
      assert.deepEqual([...jurisdictions].sort(), ["domestic", "foreign"]);
    });

    test("no department carries a country: the source encodes jurisdiction and nothing finer", () => {
      // BDR-0008: countries are invented enrichment the real hierarchy cannot
      // supply, so the store does not carry them.
      for (const d of all()) {
        assert.ok(
          !d.attributes.some((a) => a.name === "country"),
          `${d.name} carries a country attribute`,
        );
      }
    });
  });

  describe("the active flag", () => {
    test("everything in the hierarchy carries one", () => {
      for (const d of all()) {
        assert.equal(typeof d.active, "boolean", `${d.name} has no active flag`);
        assert.equal(typeof d.division.active, "boolean");
        assert.equal(typeof d.legalEntity.active, "boolean");
        assert.equal(typeof d.selectable, "boolean");
      }
    });

    test("every seeded department has a determinable jurisdiction, so nothing is seeded inactive", () => {
      // Unlike the original 58-department fixture, every department in this
      // catalog declares `foreign` explicitly (#92) - there is no
      // unclassifiable case to seed closed. transform()'s handling of that
      // case is still covered directly against the old fixture
      // (legacy-fixture-transform.test.ts); this just confirms the demo
      // catalog itself never triggers it.
      assert.ok(all().every((d) => d.attributes.some((a) => a.name === "jurisdiction")));
      assert.ok(all().every((d) => d.active));
    });

    test("an inactive department is excluded from the picker but resolvable for ever", (t) => {
      const closed = byName("Sensor Integration");
      // Restored however this test ends: the store is shared with every test
      // below, and a failed assertion must not leave one closed. Set-inactive
      // (#64) has no reverse of its own, so a full reseed is what undoes it.
      t.after(() => service.resetStore(SYSTEM));
      service.setHierarchyNodeInactive(administrator, "department", closed.id);

      assert.ok(!service.searchDepartments(SYSTEM, {}).some((d) => d.id === closed.id));
      const resolved = service.getDepartment(SYSTEM, closed.id);
      assert.equal(resolved.active, false);
      assert.equal(resolved.name, "Sensor Integration");
      // Closed, not removed: nothing left the hierarchy.
      assert.equal(service.getStoreInfo(SYSTEM).departmentCount, FIXTURE.departments);
    });

    test("a department under an inactive division is closed too, and says which level closed it", (t) => {
      const dept = byName("Heat Shielding");
      const structures = all().find((d) => d.division.name === "Structures")!.division;
      t.after(() => service.resetStore(SYSTEM));
      service.setHierarchyNodeInactive(administrator, "division", structures.id);

      assert.ok(!service.searchDepartments(SYSTEM, {}).some((d) => d.id === dept.id));
      const resolved = service.getDepartment(SYSTEM, dept.id);
      assert.equal(resolved.active, true, "the department itself was never closed");
      assert.equal(resolved.selectable, false);
      assert.equal(resolved.division.active, false);
    });
  });

  describe("searching", () => {
    test("no filter is required: searching cold returns everything selectable", () => {
      assert.equal(service.searchDepartments(SYSTEM, {}).length, FIXTURE.departments);
    });

    test("search matches on name, case-insensitively, anywhere in it", () => {
      const found = service.searchDepartments(SYSTEM, { text: "flight" });
      assert.equal(found.length, 1);
      assert.match(found[0]!.name, /Flight Controls Software/i);
    });

    test("filters combine, and narrow rather than widen", () => {
      const foreign = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "jurisdiction", value: "foreign" }],
      });
      const foreignWithOffshore = service.searchDepartments(SYSTEM, {
        attributes: [
          { name: "jurisdiction", value: "foreign" },
          { name: "offshore-shared-service", value: "allocated" },
        ],
      });
      assert.equal(foreignWithOffshore.length, 1);
      assert.ok(foreignWithOffshore.length < foreign.length);
      for (const d of foreignWithOffshore) assert.ok(foreign.some((f) => f.id === d.id));
    });

    test("filters and text combine", () => {
      const found = service.searchDepartments(SYSTEM, {
        text: "shield",
        attributes: [{ name: "jurisdiction", value: "foreign" }],
      });
      assert.equal(found.length, 1);
      assert.equal(found[0]!.name, "Heat Shielding");
    });

    test("narrowing to a legal entity or a division is structure, not an attribute", () => {
      const entity = all()[0]!.legalEntity;
      const allInEntity = service.searchDepartments(SYSTEM, { legalEntityId: entity.id });
      assert.equal(allInEntity.length, FIXTURE.departments);

      const avionics = all().find((d) => d.division.name === "Avionics")!.division;
      const inAvionics = service.searchDepartments(SYSTEM, { divisionId: avionics.id });
      assert.equal(inAvionics.length, 2);
    });

    test("an attribute nothing carries returns nothing rather than everything", () => {
      assert.deepEqual(
        service.searchDepartments(SYSTEM, {
          attributes: [{ name: "jurisdiction", value: "lunar" }],
        }),
        [],
      );
    });

    test("results are ordered by name, so the list a submitter reads is stable", () => {
      const names = service.searchDepartments(SYSTEM, {}).map((d) => d.name);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe("repeatability", () => {
    test("re-seeding from empty produces the same hierarchy", () => {
      const before = JSON.stringify(all());
      service.resetStore(SYSTEM);
      assert.equal(JSON.stringify(all()), before);
    });

    test("the store reports what it seeded", () => {
      const info = service.getStoreInfo(SYSTEM);
      assert.equal(info.departmentCount, FIXTURE.departments);
    });
  });
});
