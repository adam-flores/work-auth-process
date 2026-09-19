import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore, addTestParticipant } from "../helpers/temp-store.ts";

/**
 * The two gates (#57): Contracts and Global Trade, the two conditional
 * stages that run only when their condition holds (BDR-0014, the relay
 * configuration's `condition` on each gate stage, already proven in
 * tests/shared/relay-config.test.ts). This covers what that condition
 * being wired into the relay actually does - a gate that runs joins an
 * Approver's queue exactly like one of the four mandatory approvals
 * (CONTEXT.md: "any of them may acknowledge"), routed to its own fixed
 * department ("Contracts", "Global Trade") rather than one read off the
 * authorization; a gate that does not run resolves itself the moment it
 * arrives, appending an explicit gate-skip transition that carries the
 * value that decided it (ADR-0004) rather than leaving the skip to be
 * inferred later.
 *
 * The demo roster (config/participants.json) seeds no gate Approvers at all
 * (#92: the happy path is company-funded with matching location types, so
 * it skips both gates) - one is added directly to this test's own store
 * (`addTestParticipant`) at each gate's own fixed department name
 * ("Contracts", "Global Trade"), not drawn from the org hierarchy the way
 * the four mandatory approvals' departments are.
 */

describe("the two gates", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let contractsApprover: string;
  let globalTradeApprover: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    addTestParticipant(store.path, {
      id: "p-test-contracts-approver",
      name: "Test Contracts Approver",
      role: "Approver",
      department: "Contracts",
    });
    addTestParticipant(store.path, {
      id: "p-test-global-trade-approver",
      name: "Test Global Trade Approver",
      role: "Approver",
      department: "Global Trade",
    });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    // Deliberately the same person: the demo roster (#92) seeds one Approver
    // per department, and nothing here needs the two requesting-side stages
    // acknowledged by different people.
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-priya-anand")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;
    contractsApprover = people.find((p) => p.id === "p-test-contracts-approver")!.id;
    globalTradeApprover = people.find((p) => p.id === "p-test-global-trade-approver")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  /** Raises and initiates an authorization with the given funding type and
   *  location types, everything else fixed - the only fields either gate's
   *  condition reads. */
  function initiateAuthorization(
    project: string,
    fields: {
      fundingType: "commercial-contract" | "government-commercial-item-contract" | "government-negotiated-contract" | "company-funded";
      requestingLocationType: "domestic" | "international";
      performingLocationType: "domestic" | "international";
    },
  ) {
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project,
        requestingDepartmentId: requestingDeptId,
        performingDepartmentId: performingDeptId,
        ...fields,
        requestingProgramManager: "Dana Ferris",
        requestingFinanceApprover: "Kim Osei",
        performingProgramManager: "Lior Amsel",
        performingFinanceApprover: "Priya Nandan",
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  /** Clears the four mandatory stages so the authorization arrives at
   *  whichever gate its funding type and location types name next -
   *  running or skipped is left entirely to the relay configuration. */
  function clearMandatoryStages(authorizationId: string) {
    service.acknowledge({ participantId: requestingApproverA }, authorizationId); // -> requesting-finance
    service.acknowledge({ participantId: requestingApproverB }, authorizationId); // -> performing-department
    service.claim({ participantId: contributorAtPerformingDept }, authorizationId);
    service.contribute({ participantId: contributorAtPerformingDept }, authorizationId, {
      performingEmployee: "Jade Okafor",
    }); // -> performing-program-manager
    service.acknowledge({ participantId: performingApproverA }, authorizationId); // -> performing-finance
    return service.acknowledge({ participantId: performingApproverA }, authorizationId); // -> contracts, maybe further
  }

  function rawTransitions(authorizationId: string): { kind: string; actor_id: string; payload: string }[] {
    const raw = new DatabaseSync(store.path);
    try {
      return raw
        .prepare("SELECT kind, actor_id, payload FROM transitions WHERE authorization_id = ? ORDER BY seq")
        .all(authorizationId) as { kind: string; actor_id: string; payload: string }[];
    } finally {
      raw.close();
    }
  }

  test("Contracts runs for a contract-funded authorization and joins the Contracts Approver's queue", () => {
    const authorization = initiateAuthorization("Commercial contract work", {
      fundingType: "commercial-contract",
      requestingLocationType: "domestic",
      performingLocationType: "domestic",
    });
    const atContracts = clearMandatoryStages(authorization.id);
    assert.equal(atContracts.currentStageId, "contracts");

    const queue = service.listMyQueue({ participantId: contractsApprover });
    assert.ok(queue.some((a) => a.id === authorization.id));
    assert.ok(!service.listMyQueue({ participantId: globalTradeApprover }).some((a) => a.id === authorization.id));
  });

  test("the Contracts Approver can see which contract type the authorization carries", () => {
    const authorization = initiateAuthorization("Government negotiated contract work", {
      fundingType: "government-negotiated-contract",
      requestingLocationType: "domestic",
      performingLocationType: "domestic",
    });
    clearMandatoryStages(authorization.id);

    const opened = service.getAuthorization({ participantId: contractsApprover }, authorization.id);
    assert.equal(opened.fundingType, "government-negotiated-contract");
  });

  test("only the Contracts Approver may acknowledge a Contracts gate - a Global Trade Approver may not", () => {
    const authorization = initiateAuthorization("Refused across gates", {
      fundingType: "commercial-contract",
      requestingLocationType: "domestic",
      performingLocationType: "domestic",
    });
    clearMandatoryStages(authorization.id);
    assert.throws(
      () => service.acknowledge({ participantId: globalTradeApprover }, authorization.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_IN_QUEUE",
    );
  });

  test("acknowledging Contracts advances to Global Trade when the two sides' location types differ", () => {
    const authorization = initiateAuthorization("Contract-funded and cross-border", {
      fundingType: "commercial-contract",
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    clearMandatoryStages(authorization.id);
    const atGlobalTrade = service.acknowledge({ participantId: contractsApprover }, authorization.id);
    assert.equal(atGlobalTrade.currentStageId, "global-trade");

    const queue = service.listMyQueue({ participantId: globalTradeApprover });
    assert.ok(queue.some((a) => a.id === authorization.id));
  });

  test("Global Trade is given every field on the authorization and every attribute of both departments", () => {
    const authorization = initiateAuthorization("Cross-border review", {
      fundingType: "commercial-contract",
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    clearMandatoryStages(authorization.id);
    const atGlobalTrade = service.acknowledge({ participantId: contractsApprover }, authorization.id); // -> global-trade

    const opened = service.getAuthorization({ participantId: globalTradeApprover }, authorization.id);
    const requesting = service.getDepartment({ participantId: globalTradeApprover }, opened.requestingDepartmentId);
    const performing = service.getDepartment({ participantId: globalTradeApprover }, opened.performingDepartmentId);

    // The same object acknowledging Contracts returned - Global Trade sees
    // the whole authorization, not a projection of it (BDR-0007).
    assert.deepEqual(opened, atGlobalTrade);
    // Every attribute either department carries is reachable the same way
    // any other stage's approver reaches it - nothing is withheld and
    // nothing here derives an export determination from it.
    assert.ok(Array.isArray(requesting.attributes));
    assert.ok(Array.isArray(performing.attributes));
  });

  test("Contracts is skipped entirely for company-funded work, appending an explicit gate-skip transition", () => {
    const authorization = initiateAuthorization("Company funded, cross-border", {
      fundingType: "company-funded",
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    const advanced = clearMandatoryStages(authorization.id);

    // Skipped straight through Contracts and arrived at Global Trade, which
    // runs because the location types differ.
    assert.equal(advanced.currentStageId, "global-trade");
    assert.ok(advanced.stageHistory.find((v) => v.stageId === "contracts")!.resolvedAt);
    assert.ok(service.listMyQueue({ participantId: globalTradeApprover }).some((a) => a.id === authorization.id));
    assert.ok(!service.listMyQueue({ participantId: contractsApprover }).some((a) => a.id === authorization.id));

    const gateSkips = rawTransitions(authorization.id).filter((row) => row.kind === "gate-skip");
    assert.equal(gateSkips.length, 1);
    assert.equal(gateSkips[0]!.actor_id, "system");
    const payload = JSON.parse(gateSkips[0]!.payload) as { stageId: string; fields: Record<string, unknown> };
    assert.equal(payload.stageId, "contracts");
    assert.deepEqual(payload.fields, { fundingType: "company-funded" });
  });

  test("Global Trade is skipped when the two sides' location types match, appending an explicit gate-skip transition", () => {
    const authorization = initiateAuthorization("Contract-funded, same country", {
      fundingType: "government-commercial-item-contract",
      requestingLocationType: "international",
      performingLocationType: "international",
    });
    clearMandatoryStages(authorization.id);
    const resolved = service.acknowledge({ participantId: contractsApprover }, authorization.id); // -> global-trade, skipped, -> charge-number-admin

    assert.equal(resolved.currentStageId, "charge-number-admin");
    assert.ok(resolved.stageHistory.find((v) => v.stageId === "global-trade")!.resolvedAt);

    const gateSkips = rawTransitions(authorization.id).filter((row) => row.kind === "gate-skip");
    assert.equal(gateSkips.length, 1);
    const payload = JSON.parse(gateSkips[0]!.payload) as { stageId: string; fields: Record<string, unknown> };
    assert.equal(payload.stageId, "global-trade");
    assert.deepEqual(payload.fields, {
      requestingLocationType: "international",
      performingLocationType: "international",
    });
  });

  test("both gates are skipped in one step for company-funded work with matching location types", () => {
    const authorization = initiateAuthorization("Skips both gates", {
      fundingType: "company-funded",
      requestingLocationType: "domestic",
      performingLocationType: "domestic",
    });
    const advanced = clearMandatoryStages(authorization.id);

    // Both gates skip in the same step, straight through to the mint stage
    // (#58) - neither one has anywhere to hold the authorization once its
    // own condition is false.
    assert.equal(advanced.currentStageId, "charge-number-admin");
    assert.ok(advanced.stageHistory.find((v) => v.stageId === "contracts")!.resolvedAt);
    assert.ok(advanced.stageHistory.find((v) => v.stageId === "global-trade")!.resolvedAt);

    const gateSkips = rawTransitions(authorization.id).filter((row) => row.kind === "gate-skip");
    assert.equal(gateSkips.length, 2);
    assert.deepEqual(
      gateSkips.map((row) => (JSON.parse(row.payload) as { stageId: string }).stageId),
      ["contracts", "global-trade"],
    );

    assert.ok(!service.listMyQueue({ participantId: contractsApprover }).some((a) => a.id === authorization.id));
    assert.ok(!service.listMyQueue({ participantId: globalTradeApprover }).some((a) => a.id === authorization.id));
  });

  test("both gates run in sequence for contract-funded, cross-border work", () => {
    const authorization = initiateAuthorization("Runs both gates", {
      fundingType: "government-commercial-item-contract",
      requestingLocationType: "domestic",
      performingLocationType: "international",
    });
    const atContracts = clearMandatoryStages(authorization.id);
    assert.equal(atContracts.currentStageId, "contracts");

    const atGlobalTrade = service.acknowledge({ participantId: contractsApprover }, authorization.id);
    assert.equal(atGlobalTrade.currentStageId, "global-trade");

    const resolved = service.acknowledge({ participantId: globalTradeApprover }, authorization.id);
    assert.equal(resolved.currentStageId, "charge-number-admin");
    assert.ok(resolved.stageHistory.find((v) => v.stageId === "contracts")!.resolvedAt);
    assert.ok(resolved.stageHistory.find((v) => v.stageId === "global-trade")!.resolvedAt);

    assert.equal(rawTransitions(authorization.id).filter((row) => row.kind === "gate-skip").length, 0);
  });
});
