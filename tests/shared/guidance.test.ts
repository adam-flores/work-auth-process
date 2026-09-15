import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FIELD_GUIDANCE, STAGE_CRITERIA } from "../../src/guidance/content.ts";
import type { DraftFieldKey, StageId } from "../../src/guidance/content.ts";

/**
 * Guidance content (#52) is addressable by field and by stage - this just
 * proves every address resolves to something, so a field or a stage added
 * later and left unaddressed fails loudly instead of silently rendering
 * nothing at the point of entry.
 */

const DRAFT_FIELD_KEYS: DraftFieldKey[] = [
  "project",
  "requestingDepartmentId",
  "performingDepartmentId",
  "fundingType",
  "requestingLocationType",
  "performingLocationType",
  "requestingProgramManager",
  "requestingFinanceApprover",
  "performingProgramManager",
  "performingFinanceApprover",
  "performingContact",
  "resources",
];

const STAGE_IDS: StageId[] = [
  "requesting-program-manager",
  "requesting-finance",
  "performing-department",
  "performing-program-manager",
  "performing-finance",
  "contracts",
  "global-trade",
];

describe("field guidance", () => {
  for (const field of DRAFT_FIELD_KEYS) {
    test(`"${field}" has non-empty guidance text`, () => {
      assert.ok(FIELD_GUIDANCE[field].text.trim().length > 0);
    });
  }

  test("every owning stage named actually exists in STAGE_CRITERIA", () => {
    for (const field of DRAFT_FIELD_KEYS) {
      const ownerStage = FIELD_GUIDANCE[field].ownerStage;
      if (ownerStage !== null) assert.ok(ownerStage in STAGE_CRITERIA, `${field} -> ${ownerStage}`);
    }
  });
});

describe("stage criteria", () => {
  for (const stage of STAGE_IDS) {
    test(`"${stage}" has a concern and non-empty criteria text`, () => {
      assert.ok(STAGE_CRITERIA[stage].concern.trim().length > 0);
      assert.ok(STAGE_CRITERIA[stage].criteria.trim().length > 0);
    });
  }
});
