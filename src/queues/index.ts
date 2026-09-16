import type { DatabaseSync } from "node:sqlite";
import { RELAY_CONFIG, isContributionStage, isGateStage } from "../relay/config.ts";
import type { RelayStage } from "../relay/config.ts";
import { resolveDepartment } from "../hierarchy/index.ts";
import { listAuthorizations } from "../authorizations/index.ts";
import type { Authorization } from "../authorizations/index.ts";

/**
 * Where a stage's queue lives (#55): "a role at a department," never a named
 * person (BDR-0002, BDR-0013) - every Approver whose seeded department
 * matches sees the same queue, and any of them may acknowledge. An approval
 * stage's department is read off the authorization itself, requesting or
 * performing per the stage's side.
 *
 * An approval stage's department is matched by name against a participant's
 * own `department` string (config/participants.json) - both are drawn from
 * the same synthetic hierarchy, and nothing enforces that a name is unique
 * across it. Good enough for this fixture's departments, which are already
 * distinct by name; a real build would carry a department id on a
 * participant rather than trust a name match.
 *
 * A gate's is not: Contracts and Global Trade are centralized compliance
 * functions tied to neither side, so a gate stage carries its own queue
 * department on itself (`GateStage.department` in `relay/config.ts`) rather
 * than reading one off the authorization - "Contracts" and "Global Trade",
 * seeded like any other Approver's in config/participants.json rather than
 * drawn from the org hierarchy (#57). The only stage kind whose side is
 * "neutral" is a gate, so reading it back here is exhaustive.
 */
function queueDepartment(db: DatabaseSync, authorization: Authorization, stage: RelayStage): string | null {
  switch (stage.side) {
    case "requesting":
      return resolveDepartment(db, authorization.requestingDepartmentId)!.name;
    case "performing":
      return resolveDepartment(db, authorization.performingDepartmentId)!.name;
    case "neutral":
      return isGateStage(stage) ? stage.department : null;
  }
}

/**
 * Every authorization currently awaiting an Approver at `department` -
 * derived from the log (ADR-0004), not maintained as a list of its own. An
 * authorization leaves the moment its stage resolves, because
 * `currentStageId` itself moves on (#55) - there is nothing separate to
 * remove it from.
 */
export function listApproverQueue(db: DatabaseSync, department: string): Authorization[] {
  return listAuthorizations(db).filter((authorization) => {
    const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
    return isAcknowledgeableStage(stage) && queueDepartment(db, authorization, stage) === department;
  });
}

/** Whether `participant` may act on `authorization`'s current stage - the
 *  one check behind both what appears in their queue and whether an
 *  acknowledgement they attempt is genuinely theirs to make. */
export function isQueuedFor(
  db: DatabaseSync,
  authorization: Authorization,
  participant: { role: string; department: string },
): boolean {
  if (participant.role !== "Approver") return false;
  const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  return isAcknowledgeableStage(stage) && queueDepartment(db, authorization, stage) === participant.department;
}

/** A gate that runs resolves exactly like one of the four mandatory
 *  approvals - a role at a department acknowledges it (CONTEXT.md: "any of
 *  them may acknowledge") - so it belongs in an Approver's queue the same
 *  way. A gate that does not run never reaches a queue at all: it resolves
 *  itself via a gate-skip transition the moment it arrives
 *  (`authorizations/index.ts`), before any queue is ever read. */
function isAcknowledgeableStage(stage: RelayStage): boolean {
  return stage.kind === "approval" || isGateStage(stage);
}

/**
 * Every authorization sitting at the performing-department stage for
 * `department` (#56) - claimed and unclaimed alike. A department's queue
 * distinguishes claimed from unclaimed rather than filtering one out
 * (CONTEXT.md: "Queue"); `authorization.performingContributorId` is what a
 * caller reads to tell them apart.
 */
export function listContributorQueue(db: DatabaseSync, department: string): Authorization[] {
  return listAuthorizations(db).filter((authorization) => {
    const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
    return isContributionStage(stage) && queueDepartment(db, authorization, stage) === department;
  });
}

/** Whether `participant` may claim `authorization` - a Contributor at the
 *  performing-department stage's own department, and only while it sits
 *  unclaimed (CONTEXT.md: "Claim" - claiming is what names the performing
 *  contributor, so once one exists there is nobody left to name). */
export function isQueuedForClaim(
  db: DatabaseSync,
  authorization: Authorization,
  participant: { role: string; department: string },
): boolean {
  if (participant.role !== "Contributor") return false;
  if (authorization.performingContributorId !== null) return false;
  const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  return isContributionStage(stage) && queueDepartment(db, authorization, stage) === participant.department;
}
