import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONFIG, isGateStage, isContributionStage, firstStage } from "../../src/relay/config.ts";
import type { DraftFieldValues } from "../../src/drafts/index.ts";

/**
 * The relay configuration (#54, #56): one ordered artifact, read directly
 * rather than seeded (ADR-0004, ADR-0011). This proves its shape - order,
 * side, kind, and that a condition exists on every gate and only on a gate -
 * without a store, the same way `guidance.test.ts` checks content alone.
 */

const STAGE_IDS_IN_ORDER = [
  "requesting-program-manager",
  "requesting-finance",
  "performing-department",
  "performing-program-manager",
  "performing-finance",
  "contracts",
  "global-trade",
];

function emptyFields(overrides: Partial<DraftFieldValues> = {}): DraftFieldValues {
  return {
    project: null,
    requestingDepartmentId: null,
    performingDepartmentId: null,
    fundingType: null,
    requestingLocationType: null,
    performingLocationType: null,
    requestingProgramManager: null,
    requestingFinanceApprover: null,
    performingProgramManager: null,
    performingFinanceApprover: null,
    performingContact: null,
    ...overrides,
  };
}

describe("the relay configuration", () => {
  test("is the six flow-document stages plus the performing-department claim, in order", () => {
    assert.deepEqual(
      RELAY_CONFIG.map((s) => s.id),
      STAGE_IDS_IN_ORDER,
    );
  });

  test("the first stage is what an initiated authorization sits at", () => {
    assert.equal(firstStage().id, "requesting-program-manager");
  });

  test("every stage carries a side, a concern, and a field-dependency list", () => {
    for (const stage of RELAY_CONFIG) {
      assert.ok(["requesting", "performing", "neutral"].includes(stage.side), stage.id);
      assert.ok(stage.concern.trim().length > 0, stage.id);
      assert.ok(Array.isArray(stage.fieldDependencies), stage.id);
    }
  });

  test("a condition exists on every gate, and only on a gate", () => {
    for (const stage of RELAY_CONFIG) {
      if (isGateStage(stage)) {
        assert.equal(typeof stage.condition, "function", stage.id);
      } else {
        assert.ok(!("condition" in stage), stage.id);
      }
    }
  });

  test("every gate carries its own fixed queue department, distinct from the other's (#57)", () => {
    const contracts = RELAY_CONFIG.find((s) => s.id === "contracts")!;
    const globalTrade = RELAY_CONFIG.find((s) => s.id === "global-trade")!;
    assert.ok(isGateStage(contracts));
    assert.ok(isGateStage(globalTrade));
    assert.equal(contracts.department, "Contracts");
    assert.equal(globalTrade.department, "Global Trade");
  });

  test("the requesting finance approver's sign-off declares no dependencies (ADR-0005)", () => {
    const stage = RELAY_CONFIG.find((s) => s.id === "requesting-finance")!;
    assert.deepEqual(stage.fieldDependencies, []);
  });

  test("the performing department stage is a contribution, resolved by claiming rather than acknowledging (#56)", () => {
    const stage = RELAY_CONFIG.find((s) => s.id === "performing-department")!;
    assert.ok(isContributionStage(stage));
    assert.equal(stage.side, "performing");
    assert.ok(!isGateStage(stage));
    assert.ok(!("condition" in stage));
  });

  test("the performing department stage sits between requesting finance and performing program manager", () => {
    const index = RELAY_CONFIG.findIndex((s) => s.id === "performing-department");
    assert.equal(RELAY_CONFIG[index - 1]!.id, "requesting-finance");
    assert.equal(RELAY_CONFIG[index + 1]!.id, "performing-program-manager");
  });

  test("the Contracts gate runs for every contract-funded type and skips company-funded work", () => {
    const contracts = RELAY_CONFIG.find((s) => s.id === "contracts")!;
    assert.ok(isGateStage(contracts));
    assert.equal(contracts.condition(emptyFields({ fundingType: "commercial-contract" })), true);
    assert.equal(
      contracts.condition(emptyFields({ fundingType: "government-commercial-item-contract" })),
      true,
    );
    assert.equal(contracts.condition(emptyFields({ fundingType: "government-negotiated-contract" })), true);
    assert.equal(contracts.condition(emptyFields({ fundingType: "company-funded" })), false);
    assert.equal(contracts.condition(emptyFields()), false);
  });

  test("the Global Trade gate runs only when the two declared location types differ (BDR-0014)", () => {
    const globalTrade = RELAY_CONFIG.find((s) => s.id === "global-trade")!;
    assert.ok(isGateStage(globalTrade));
    assert.equal(
      globalTrade.condition(
        emptyFields({ requestingLocationType: "domestic", performingLocationType: "international" }),
      ),
      true,
    );
    assert.equal(
      globalTrade.condition(
        emptyFields({ requestingLocationType: "domestic", performingLocationType: "domestic" }),
      ),
      false,
    );
    assert.equal(globalTrade.condition(emptyFields({ requestingLocationType: "domestic" })), false);
  });
});
