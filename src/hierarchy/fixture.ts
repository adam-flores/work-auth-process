import { z } from "zod";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The shape a hierarchy fixture must have to seed the store, general enough to
 * cover both fixtures this repository has used.
 *
 * `docs/reference/organization-hierarchy.json` — the transcribed 58-department
 * fixture ADR-0012 was written against — is the demanding case: its three
 * legal entities differ in **shape**, not only in values (CAL departments
 * carry a single conflated `code` and none of the cost-accounting fields the
 * other two spell out, and CAL divisions carry only a name), which is why
 * every field below but `legalName` is optional. `docs/reference/demo-hierarchy.json`
 * — what actually seeds the store since #92 — is the simple case: freshly
 * authored, not transcribed, and uses only `foreign` and `icons`/`footnotes`.
 * See ADR-0013 for why the seed changed and ADR-0012 for why the schema is
 * shaped the way it is.
 *
 * Unlisted keys are dropped by parsing, which is deliberate: the fields that
 * carry an encoding rather than a value (`fill`, `textColour`, the source's
 * layout and code-scheme notes) describe the document the shape was transcribed
 * from, not the organization. ADR-0012 records which those are and why.
 */

/** The fixture's own spelling, mirroring its `costCentres` key. Everything the
 *  product names itself uses CONTEXT.md's *cost center*. */
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
 *
 * Points at the small demo catalog (ADR-0013), not the original 58-department
 * `organization-hierarchy.json` — that file stays in the repository as the
 * historical record ADR-0012 describes, but it is no longer what seeds a
 * running store.
 */
export const FIXTURE_PATH = resolve(repoRoot, "docs/reference/demo-hierarchy.json");

export function readFixture(): Fixture {
  return Fixture.parse(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as unknown);
}
