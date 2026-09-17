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
 * The fixture these run against is `docs/reference/organization-hierarchy.json`,
 * which is deliberately awkward. Each irregularity has a test below, because
 * #49 requires them resolved explicitly rather than carried.
 */

const SYSTEM = { participantId: "system" };

/** The fixture's own counts, from `docs/reference/organization-hierarchy.md`. */
const FIXTURE = { legalEntities: 3, divisions: 12, departments: 58, foreign: 17 };

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
      const rotorHubs = byName("Rotor Hubs");
      assert.equal(rotorHubs.division.name, "Rotor Assemblies");
      assert.match(rotorHubs.legalEntity.name, /Calderis Structures Group/);
    });

    test("an unknown department id is refused rather than guessed at", () => {
      assert.throws(() => service.getDepartment(SYSTEM, "no-such-department"), {
        code: "UNKNOWN_DEPARTMENT",
      });
    });
  });

  describe("attributes and inheritance", () => {
    test("an attribute is held at the level it belongs to", () => {
      // The same attribute hangs at two different levels in this fixture, which
      // is what BDR-0008 means by attributes not being tied to a level.
      const heatExchange = byName("Heat Exchange Products");
      const homeOffice = heatExchange.attributes.find(
        (a) => a.name === "home-office-disclosure",
      );
      assert.ok(homeOffice, "Heat Exchange Products should carry home-office-disclosure");
      assert.deepEqual(homeOffice.heldAt, ["division", "department"]);

      const rotorHubs = byName("Rotor Hubs");
      const inherited = rotorHubs.attributes.find((a) => a.name === "home-office-disclosure");
      assert.ok(inherited, "Rotor Hubs should inherit home-office-disclosure from its division");
      assert.deepEqual(inherited.heldAt, ["division"]);
    });

    test("a department reads its own attributes plus every attribute above it", () => {
      const deutschland = byName("Calderis Deutschland GmbH");
      const names = deutschland.attributes.map((a) => a.name);

      // Its own.
      assert.ok(names.includes("jurisdiction"));
      assert.ok(names.includes("contracting-exception"));
      // Its legal entity's.
      const affiliation = deutschland.attributes.find((a) => a.name === "affiliation");
      assert.ok(affiliation);
      assert.deepEqual(affiliation.heldAt, ["legal-entity"]);
    });

    test("no attribute is listed twice, however many levels hold it", () => {
      for (const d of all()) {
        const pairs = d.attributes.map((a) => `${a.name}=${a.value}`);
        assert.equal(new Set(pairs).size, pairs.length, `${d.name} lists an attribute twice`);
      }
    });

    test("filtering finds a department by an attribute its division holds", () => {
      // Rotor Hubs holds nothing itself; it matches only through inheritance.
      const found = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "home-office-disclosure", value: "included" }],
      });
      assert.ok(found.some((d) => d.name === "Rotor Hubs"));
    });
  });

  describe("foreign and domestic", () => {
    test("it survives as an attribute rather than a position in the hierarchy", () => {
      const foreign = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "jurisdiction", value: "foreign" }],
        includeInactive: true,
      });
      assert.equal(foreign.length, FIXTURE.foreign);

      // Scattered, not grouped: more than one legal entity, and siblings of
      // domestic departments in the same division.
      assert.ok(new Set(foreign.map((d) => d.legalEntity.id)).size > 1);

      const rotorAssemblies = all().filter((d) => d.division.name === "Rotor Assemblies");
      const jurisdictions = new Set(
        rotorAssemblies.flatMap((d) =>
          d.attributes.filter((a) => a.name === "jurisdiction").map((a) => a.value),
        ),
      );
      assert.deepEqual([...jurisdictions].sort(), ["domestic", "foreign"]);
    });

    test("no department carries a country: the source encodes jurisdiction and nothing finer", () => {
      // BDR-0008: the specific countries in the fixture are invented enrichment
      // the real hierarchy cannot supply, so the store does not carry them.
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

    test("a department whose jurisdiction cannot be determined is seeded inactive", () => {
      // The fixture leaves one department with no jurisdiction at all. Seeding
      // it active would mean inventing a compliance attribute; the
      // permissibility rule is evaluated against exactly this attribute.
      const undetermined = all().filter(
        (d) => !d.attributes.some((a) => a.name === "jurisdiction"),
      );
      assert.equal(undetermined.length, 1);
      assert.equal(undetermined[0]?.active, false);
    });

    test("nothing else is seeded inactive", () => {
      const inactive = all().filter((d) => !d.selectable);
      assert.equal(inactive.length, 1);
    });

    test("an inactive department is excluded from the picker but resolvable for ever", (t) => {
      const closed = byName("Signal Analytics Corp");
      // Restored however this test ends: the store is shared with every test
      // below, and a failed assertion must not leave one closed. Set-inactive
      // (#64) has no reverse of its own, so a full reseed is what undoes it.
      t.after(() => service.resetStore(SYSTEM));
      service.setHierarchyNodeInactive(administrator, "department", closed.id);

      assert.ok(!service.searchDepartments(SYSTEM, {}).some((d) => d.id === closed.id));
      const resolved = service.getDepartment(SYSTEM, closed.id);
      assert.equal(resolved.active, false);
      assert.equal(resolved.name, "Signal Analytics Corp");
      // Closed, not removed: nothing left the hierarchy.
      assert.equal(service.getStoreInfo(SYSTEM).departmentCount, FIXTURE.departments);
    });

    test("a department under an inactive division is closed too, and says which level closed it", (t) => {
      const dept = byName("Vibration Lab");
      const labs = all().find((d) => d.division.name === "Labs")!.division;
      t.after(() => service.resetStore(SYSTEM));
      service.setHierarchyNodeInactive(administrator, "division", labs.id);

      assert.ok(!service.searchDepartments(SYSTEM, {}).some((d) => d.id === dept.id));
      const resolved = service.getDepartment(SYSTEM, dept.id);
      assert.equal(resolved.active, true, "the department itself was never closed");
      assert.equal(resolved.selectable, false);
      assert.equal(resolved.division.active, false);
    });

  });

  describe("the fixture's irregularities", () => {
    test("a cost centre shared by four departments identifies none of them", () => {
      const sharing = all().filter((d) => d.codes.some((c) => c.code === "20514"));
      assert.equal(sharing.length, 4);
      assert.equal(new Set(sharing.map((d) => d.id)).size, 4);
      // Each of the four carries it, each is marked as not holding it alone, and
      // none of them is reached by it. The source marked every one of the four
      // as sole, which is the marking the transformation refuses to carry.
      for (const d of sharing) {
        const code = d.codes.find((c) => c.kind === "cost-center" && c.code === "20514");
        assert.ok(code, `${d.name} should carry cost center 20514`);
        assert.equal(code.shared, true, `${d.name} should not claim 20514 alone`);
      }
    });

    test("two departments with an identical code set keep their different disclosure treatments", () => {
      const defense = byName("Thermal Defense Products");
      const commercial = byName("Thermal Commercial Ent.");
      const codes = (d: ResolvedDepartment) =>
        d.codes
          .filter((c) => c.kind === "cost-center")
          .map((c) => c.code)
          .sort();

      assert.deepEqual(codes(defense), codes(commercial));
      assert.notEqual(defense.disclosureTreatment, commercial.disclosureTreatment);
    });

    test("a department with no code at all is seeded and usable", () => {
      const noCodes = byName("Cabin Equipment - Central Engineering");
      assert.deepEqual(noCodes.codes, []);
      assert.equal(noCodes.disclosureTreatment, null);
      assert.equal(noCodes.selectable, true);
    });

    test("the literal code 'various cost centers' is not carried as a code", () => {
      const allocated = byName("Allocated Function");
      assert.deepEqual(allocated.codes, []);

      for (const d of all()) {
        for (const c of d.codes) {
          assert.ok(!/various/i.test(c.code), `${d.name} carries the code "${c.code}"`);
        }
      }
    });

    test("three codes crammed into one field become three codes", () => {
      const vantara = byName("Vantara Design Center (Vantara, Selkirk)");
      assert.deepEqual(
        vantara.codes.map((c) => c.code).sort(),
        ["D204", "D209", "D216"],
      );
    });

    test("a cost centre shared with another division is marked as shared", () => {
      const inertial = byName("Inertial Reference Systems");
      assert.equal(inertial.codes.length, 7, "six cost centres and one cost-accounting code");
      assert.equal(inertial.codes.filter((c) => c.shared).length, 1);
    });

    test("near-identical sibling names stay distinct departments", () => {
      const hubs = all().filter((d) => d.name.startsWith("Rotor Hubs"));
      assert.equal(hubs.length, 3);
      assert.equal(new Set(hubs.map((d) => d.id)).size, 3);
    });
  });

  describe("searching", () => {
    test("no filter is required: searching cold returns everything selectable", () => {
      assert.equal(service.searchDepartments(SYSTEM, {}).length, FIXTURE.departments - 1);
    });

    test("search matches on name, case-insensitively, anywhere in it", () => {
      const found = service.searchDepartments(SYSTEM, { text: "rotor shaft" });
      assert.equal(found.length, 4);
      for (const d of found) assert.match(d.name, /Rotor Shaft/i);
    });

    test("filters combine, and narrow rather than widen", () => {
      const foreign = service.searchDepartments(SYSTEM, {
        attributes: [{ name: "jurisdiction", value: "foreign" }],
      });
      const foreignWithException = service.searchDepartments(SYSTEM, {
        attributes: [
          { name: "jurisdiction", value: "foreign" },
          { name: "contracting-exception", value: "outside-own-division" },
        ],
      });
      assert.equal(foreignWithException.length, 4);
      assert.ok(foreignWithException.length < foreign.length);
      for (const d of foreignWithException) assert.ok(foreign.some((f) => f.id === d.id));
    });

    test("filters and text combine", () => {
      const found = service.searchDepartments(SYSTEM, {
        text: "rotor",
        attributes: [{ name: "jurisdiction", value: "foreign" }],
      });
      assert.equal(found.length, 4);
    });

    test("narrowing to a legal entity or a division is structure, not an attribute", () => {
      const std = service.searchDepartments(SYSTEM, { legalEntityId: "std" });
      assert.equal(std.length, 8);

      const labs = service.searchDepartments(SYSTEM, { divisionId: "cal-labs" });
      assert.equal(labs.length, 3);
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
