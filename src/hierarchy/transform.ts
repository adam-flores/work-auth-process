import type { Fixture } from "./fixture.ts";

/**
 * Seeding the hierarchy is a transformation, not a load (ADR-0011), and this is
 * the transformation. Pure: fixture in, rows out, no I/O and no clock, which is
 * what makes re-seeding from empty produce the same hierarchy every time.
 *
 * ADR-0012 records each decision made here and why. In summary:
 *
 *   - Identity is ours. A code never identifies anything, because in this data a
 *     cost center is carried by four departments and an identical code pair is
 *     carried by two with different disclosure treatments (#8's finding).
 *   - An **attribute** is level-agnostic, inherited downward and used to narrow.
 *     Everything else a department carries is **detail**: recorded, shown, never
 *     filtered on, never load-bearing.
 *   - What the source encodes only as a colour is carried as its decoded value;
 *     the carrier itself is not carried.
 *   - Nothing is invented. A fact the fixture cannot supply is absent, and a
 *     department missing the one attribute a control is evaluated against is
 *     seeded inactive rather than given a guess.
 */

export type NodeKind = "legal-entity" | "division" | "department";

export type CodeKind = "cost-accounting" | "cost-center";

export type SeedLegalEntity = { id: string; name: string; active: boolean };
export type SeedDivision = {
  id: string;
  legalEntityId: string;
  name: string;
  active: boolean;
};
export type SeedDepartment = {
  id: string;
  divisionId: string;
  name: string;
  active: boolean;
  heritage: string | null;
  disclosureTreatment: string | null;
};
export type SeedAttribute = {
  nodeKind: NodeKind;
  nodeId: string;
  name: string;
  value: string;
};
export type SeedCode = {
  departmentId: string;
  kind: CodeKind;
  code: string;
  /** Not held by this department alone. */
  shared: boolean;
};

export type SeedHierarchy = {
  legalEntities: SeedLegalEntity[];
  divisions: SeedDivision[];
  departments: SeedDepartment[];
  attributes: SeedAttribute[];
  codes: SeedCode[];
};

/**
 * The visual carriers the fixture's `encodings` block documents, and the
 * footnote its `footnotes` block defines. Named here so the derivation below
 * reads as a decoding rather than a set of magic strings.
 */
const HOME_OFFICE_ICON = "home-office-dot";
const OFFSHORE_ICON = "star";
const CONTRACTING_EXCEPTION_FOOTNOTE = "fn-2";

/**
 * A stable id from a name: lowercase, punctuation collapsed to hyphens. The
 * fixture's near-identical sibling names stay distinct under it
 * (`rotor-hubs`, `rotor-hubs-pacific`), and a collision is thrown rather than
 * silently merged — two departments becoming one is the failure this ticket
 * exists to prevent.
 */
function slug(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A code with internal whitespace is prose, not a code. It is how the fixture's
 * one unresolvable value (`various cost centers`, literally, in a code column)
 * is refused without naming it: no code in this data contains a space, so the
 * rule is general rather than a special case.
 */
function isCode(value: string): boolean {
  return value.length > 0 && !/\s/.test(value);
}

/** One field holding several comma-separated codes becomes several codes. */
function splitCodes(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(isCode);
}

export function transform(fixture: Fixture): SeedHierarchy {
  const hierarchy: SeedHierarchy = {
    legalEntities: [],
    divisions: [],
    departments: [],
    attributes: [],
    codes: [],
  };

  const claimed = new Map<string, string>();
  const claim = (kind: NodeKind, id: string, name: string): string => {
    const key = `${kind}:${id}`;
    const existing = claimed.get(key);
    if (existing !== undefined) {
      throw new Error(
        `The fixture gives two ${kind}s the same id "${id}": "${existing}" and "${name}".`,
      );
    }
    claimed.set(key, name);
    return id;
  };

  const attribute = (nodeKind: NodeKind, nodeId: string, name: string, value: string): void => {
    hierarchy.attributes.push({ nodeKind, nodeId, name, value });
  };

  for (const entity of fixture.legalEntities) {
    const entityId = claim("legal-entity", slug(entity.id), entity.name);
    hierarchy.legalEntities.push({ id: entityId, name: entity.name, active: true });

    // Held at the top and read by every department beneath it.
    if (entity.affiliation) attribute("legal-entity", entityId, "affiliation", entity.affiliation);

    for (const division of entity.divisions) {
      // A grouping in the source is a division regardless of what the source
      // called it or whether it called it anything (BDR-0004), so the id comes
      // from the entity and the name rather than from a code only some charts
      // have.
      const divisionId = claim(
        "division",
        `${entityId}-${slug(division.name)}`,
        division.name,
      );
      hierarchy.divisions.push({
        id: divisionId,
        legalEntityId: entityId,
        name: division.name,
        active: true,
      });

      // The same attribute hangs at this level for some divisions and at the
      // department level for others. Both are held where they are found.
      //
      // Read from the icon, which the fixture's `encodings` block gives a
      // meaning, rather than from the divisions' undocumented `homeOfficeLevel`
      // boolean - which says nothing about what it means, is absent from an
      // entire legal entity, and disagrees with the icon on one division
      // (ADR-0012).
      if (division.icons?.includes(HOME_OFFICE_ICON)) {
        attribute("division", divisionId, "home-office-disclosure", "included");
      }

      for (const department of division.departments) {
        const departmentId = claim("department", slug(department.legalName), department.legalName);

        // Jurisdiction is the attribute the permissibility rule is evaluated
        // against. Where the fixture cannot say, nothing is invented and the
        // department is seeded closed to new authorizations instead - inactive
        // rather than absent, so any record naming it still resolves.
        const jurisdiction =
          department.foreign === true ? "foreign" : department.foreign === false ? "domestic" : null;
        if (jurisdiction) attribute("department", departmentId, "jurisdiction", jurisdiction);

        if (department.icons?.includes(HOME_OFFICE_ICON)) {
          attribute("department", departmentId, "home-office-disclosure", "included");
        }
        if (department.icons?.includes(OFFSHORE_ICON)) {
          attribute("department", departmentId, "offshore-shared-service", "allocated");
        }
        if (department.footnotes?.includes(CONTRACTING_EXCEPTION_FOOTNOTE)) {
          attribute("department", departmentId, "contracting-exception", "outside-own-division");
        }

        hierarchy.departments.push({
          id: departmentId,
          divisionId,
          name: department.legalName,
          active: jurisdiction !== null,
          heritage: department.heritage ?? null,
          disclosureTreatment: department.disclosureStatement ?? null,
        });

        // Detail, not identity. A department with none of it is as usable as one
        // with six cost centers.
        const codes = new Map<string, SeedCode>();
        const addCode = (kind: CodeKind, code: string, shared: boolean): void => {
          codes.set(`${kind}:${code}`, { departmentId, kind, code, shared });
        };

        for (const code of splitCodes(department.costAccountingCode ?? "")) {
          addCode("cost-accounting", code, false);
        }
        // CAL's single code column, which the source never says the kind of.
        // Its legal entity declares it as that chart's code scheme, so it is
        // read as the cost-accounting code the other two charts spell out.
        for (const code of splitCodes(department.code ?? "")) {
          addCode("cost-accounting", code, false);
        }
        for (const centre of department.costCentres ?? []) {
          if (isCode(centre.code)) addCode("cost-center", centre.code, centre.sharing === "shared");
        }
        hierarchy.codes.push(...codes.values());
      }
    }
  }

  markSharedCodes(hierarchy.codes);
  return hierarchy;
}

/**
 * A code carried by more than one department is shared, whatever the source
 * said about it.
 *
 * The source marks sharing with the ink colour of an individual code, and in
 * this data that marking is wrong: four departments carry cost center `20514`
 * and every one of them is marked as holding it alone. Two more carry an
 * identical pair, also each marked sole. Sharing is a property of the whole
 * transformed set rather than of one row, so it is computed here rather than
 * copied - which is #8's finding applied to the codes themselves and not only to
 * identity. A code the source marked shared stays shared even where this fixture
 * holds only one of its holders.
 */
function markSharedCodes(codes: SeedCode[]): void {
  const holders = new Map<string, number>();
  for (const code of codes) {
    const key = `${code.kind}:${code.code}`;
    holders.set(key, (holders.get(key) ?? 0) + 1);
  }
  for (const code of codes) {
    if ((holders.get(`${code.kind}:${code.code}`) ?? 0) > 1) code.shared = true;
  }
}
