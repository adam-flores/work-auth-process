import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The shape of `docs/reference/organization-hierarchy.json`, as it actually is
 * rather than as it ought to be.
 *
 * The fixture's three legal entities differ in **shape**, not only in values:
 * CSG and STD departments carry `costAccountingCode`, `costCentres`, `heritage`
 * and `disclosureStatement`, while CAL departments carry a single conflated
 * `code` and none of the rest. CAL divisions carry only a name. That is faithful
 * to the source — three charts sharing no layout and no code scheme — so the
 * parser accepts all three and the transformation is what reconciles them.
 *
 * Unlisted keys are dropped by parsing, which is deliberate: the fields that
 * carry an encoding rather than a value (`fill`, `textColour`, the source's
 * layout and code-scheme notes) describe the document the shape was transcribed
 * from, not the organization. ADR-0012 records which those are and why.
 */

const CostCentre = z.object({
  code: z.string().trim().min(1),
  sharing: z.enum(["sole", "shared"]),
});

const FixtureDepartment = z.object({
  legalName: z.string().trim().min(1),
  /** CSG and STD. */
  costAccountingCode: z.string().trim().nullish(),
  costCentres: z.array(CostCentre).nullish(),
  /** CAL's single code column, which the source never says the kind of. */
  code: z.string().trim().nullish(),
  heritage: z.string().trim().nullish(),
  disclosureStatement: z.string().trim().nullish(),
  /** Authoritative for jurisdiction. Null where the fixture cannot say. */
  foreign: z.boolean().nullish(),
  icons: z.array(z.string()).nullish(),
  footnotes: z.array(z.string()).nullish(),
});

const FixtureDivision = z.object({
  name: z.string().trim().min(1),
  icons: z.array(z.string()).nullish(),
  departments: z.array(FixtureDepartment),
});

const FixtureLegalEntity = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  affiliation: z.string().trim().nullish(),
  divisions: z.array(FixtureDivision),
});

export const Fixture = z.object({ legalEntities: z.array(FixtureLegalEntity).min(1) });

export type Fixture = z.infer<typeof Fixture>;
export type FixtureDepartment = z.infer<typeof FixtureDepartment>;
export type FixtureDivision = z.infer<typeof FixtureDivision>;
export type FixtureLegalEntity = z.infer<typeof FixtureLegalEntity>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The fixture is read from `docs/` rather than copied into `config/`, so there
 * is one artifact and no second copy to drift from it — the same reasoning
 * ADR-0011 applies to the relay configuration.
 */
export const FIXTURE_PATH = resolve(repoRoot, "docs/reference/organization-hierarchy.json");

export function readFixture(path: string = FIXTURE_PATH): Fixture {
  return Fixture.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
