import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * The master dashboard (#63, BDR-0002): every authorization in the system,
 * open to anyone with access - the opposite of a queue, which is scoped and
 * arrival-only. Unlike `listMyQueue` (`listAuthorizations` in
 * `authorizations/index.ts`), completed and withdrawn authorizations are not
 * filtered out - the whole point of this surface is to keep showing them
 * after a queue would have dropped them. A draft is visible here too
 * (BDR-0003: "on the master dashboard like anything else"), since it has not
 * yet reached anybody's queue at all.
 */

describe("master dashboard", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let requestingApproverA: string;
  let requestingApproverB: string;
  let performingApproverA: string;
  let contributorAtPerformingDept: string;
  let chargeNumberAdmin: string;
  let requestingDeptId: string;
  let performingDeptId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });

    const people = service.listParticipants({ participantId: "system" });
    submitter = people.find((p) => p.id === "p-teo-brandt")!.id;
    requestingApproverA = people.find((p) => p.id === "p-priya-anand")!.id;
    requestingApproverB = people.find((p) => p.id === "p-priya-anand")!.id;
    performingApproverA = people.find((p) => p.id === "p-marcus-oduya")!.id;
    contributorAtPerformingDept = people.find((p) => p.id === "p-jordan-hale")!.id;
    chargeNumberAdmin = people.find((p) => p.id === "p-elin-vasquez")!.id;

    const departments = service.searchDepartments({ participantId: "system" });
    requestingDeptId = departments.find((d) => d.name === "Rotor Assemblies")!.id;
    performingDeptId = departments.find((d) => d.name === "Flight Controls Software")!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  function initiateAuthorization(project: string) {
    const draft = service.createDraft(
      { participantId: submitter },
      {
        project,
        requestingDepartmentId: requestingDeptId,
        performingDepartmentId: performingDeptId,
        fundingType: "company-funded",
        requestingLocationType: "domestic",
        performingLocationType: "domestic",
        requestingProgramManager: "Dana Ferris",
        requestingFinanceApprover: "Kim Osei",
        performingProgramManager: "Lior Amsel",
        performingFinanceApprover: "Priya Nandan",
      },
    );
    service.addResource({ participantId: submitter }, draft.id, { budgetHours: 40, laborRate: 85.5 });
    return service.initiateDraft({ participantId: submitter }, draft.id);
  }

  function reachMintStage(project: string) {
    const authorization = initiateAuthorization(project);
    service.acknowledge({ participantId: requestingApproverA }, authorization.id);
    service.acknowledge({ participantId: requestingApproverB }, authorization.id);
    service.claim({ participantId: contributorAtPerformingDept }, authorization.id);
    service.contribute({ participantId: contributorAtPerformingDept }, authorization.id, {
      performingEmployee: "Jade Okafor",
    });
    service.acknowledge({ participantId: performingApproverA }, authorization.id);
    return service.acknowledge({ participantId: performingApproverA }, authorization.id);
  }

  test("shows an in-flight authorization, unlike a queue it names none of", () => {
    const authorization = initiateAuthorization("Dashboard shows in-flight work");
    const dashboard = service.listDashboard({ participantId: "system" });
    assert.ok(dashboard.authorizations.some((a) => a.id === authorization.id));
  });

  test("keeps a completed authorization, which a queue would have dropped", () => {
    const authorization = reachMintStage("Dashboard keeps completed work");
    service.mintChargeNumber({ participantId: chargeNumberAdmin }, authorization.id, { chargeNumber: "CN-63-1" });

    const dashboard = service.listDashboard({ participantId: "system" });
    const found = dashboard.authorizations.find((a) => a.id === authorization.id);
    assert.ok(found, "a completed authorization must still appear on the master dashboard");
    assert.equal(found!.chargeNumber, "CN-63-1");
  });

  test("keeps a withdrawn authorization, which a queue would have dropped", () => {
    const authorization = initiateAuthorization("Dashboard keeps withdrawn work");
    service.withdraw({ participantId: submitter }, authorization.id);

    const dashboard = service.listDashboard({ participantId: "system" });
    const found = dashboard.authorizations.find((a) => a.id === authorization.id);
    assert.ok(found, "a withdrawn authorization must still appear on the master dashboard");
    assert.ok(found!.withdrawnAt);
  });

  test("a draft is visible on the master dashboard, like anything else", () => {
    const draft = service.createDraft({ participantId: submitter }, { project: "Still just a draft" });
    const dashboard = service.listDashboard({ participantId: "system" });
    assert.ok(dashboard.drafts.some((d) => d.id === draft.id));
  });

  test("open to any known participant, not only the submitter or a stage's approver", () => {
    const authorization = initiateAuthorization("Open to everyone");
    const dashboard = service.listDashboard({ participantId: chargeNumberAdmin });
    assert.ok(dashboard.authorizations.some((a) => a.id === authorization.id));
  });
});
