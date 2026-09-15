import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DraftFields, CompleteDraftFields } from "../../src/shared/rules.ts";

/**
 * The rule module itself (#52): one shape, evaluated at two strictnesses.
 * `DraftFields` is what a draft accepts - everything optional;
 * `CompleteDraftFields` is what initiation requires - business case §10
 * assumption 14, "every field ... is required." Not covered here: the
 * `initiate` command that will call this (#54) - only the rule set it will
 * call.
 */

const COMPLETE_INPUT = {
  project: "Rotor recertification",
  requestingDepartmentId: "dept-requesting",
  performingDepartmentId: "dept-performing",
  fundingType: "company-funded",
  requestingLocationType: "domestic",
  performingLocationType: "domestic",
  requestingProgramManager: "Dana Ferris",
  requestingFinanceApprover: "Kim Osei",
  performingProgramManager: "Lior Amsel",
  performingFinanceApprover: "Priya Nandan",
  performingContact: null,
  resources: [{ budgetHours: 40, laborRate: 85.5 }],
};

describe("DraftFields (draft strictness)", () => {
  test("a draft naming nothing at all is valid", () => {
    const parsed = DraftFields.safeParse({});
    assert.ok(parsed.success);
  });

  test("a draft with only some fields set is valid", () => {
    const parsed = DraftFields.safeParse({ project: "Partial" });
    assert.ok(parsed.success);
  });

  test("the requesting and performing department may not be the same", () => {
    const parsed = DraftFields.safeParse({
      requestingDepartmentId: "dept-a",
      performingDepartmentId: "dept-a",
    });
    assert.ok(!parsed.success);
  });

  test("a name present but blank is refused rather than silently kept", () => {
    const parsed = DraftFields.safeParse({ requestingProgramManager: "   " });
    assert.ok(!parsed.success);
  });
});

describe("CompleteDraftFields (initiation strictness)", () => {
  test("every field present, including a resource, is complete", () => {
    const parsed = CompleteDraftFields.safeParse(COMPLETE_INPUT);
    assert.ok(parsed.success);
  });

  test("the performing-side contact stays optional even at initiation (BDR-0013)", () => {
    const { performingContact, ...rest } = COMPLETE_INPUT;
    const parsed = CompleteDraftFields.safeParse(rest);
    assert.ok(parsed.success);
  });

  for (const field of [
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
  ] as const) {
    test(`missing "${field}" is incomplete`, () => {
      const { [field]: _omit, ...rest } = COMPLETE_INPUT;
      const parsed = CompleteDraftFields.safeParse(rest);
      assert.ok(!parsed.success);
    });

    test(`"${field}" set to null is incomplete`, () => {
      const parsed = CompleteDraftFields.safeParse({ ...COMPLETE_INPUT, [field]: null });
      assert.ok(!parsed.success);
    });
  }

  test("no resources at all is incomplete", () => {
    const parsed = CompleteDraftFields.safeParse({ ...COMPLETE_INPUT, resources: [] });
    assert.ok(!parsed.success);
  });

  test("the requesting and performing department may not be the same, even complete otherwise", () => {
    const parsed = CompleteDraftFields.safeParse({
      ...COMPLETE_INPUT,
      performingDepartmentId: COMPLETE_INPUT.requestingDepartmentId,
    });
    assert.ok(!parsed.success);
  });

  test("a validator relaxed by DraftFields is the same validator CompleteDraftFields tightens", () => {
    // Both reject the same malformed project name with the same message -
    // one rule, not two written separately.
    const draftResult = DraftFields.safeParse({ project: "" });
    const completeResult = CompleteDraftFields.safeParse({ ...COMPLETE_INPUT, project: "" });
    assert.ok(!draftResult.success);
    assert.ok(!completeResult.success);
    assert.equal(draftResult.error.issues[0]?.message, completeResult.error.issues[0]?.message);
  });
});
