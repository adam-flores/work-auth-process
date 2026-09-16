import type { DatabaseSync } from "node:sqlite";
import { RELAY_CONFIG, isContributionStage, isGateStage, isMintStage } from "../relay/config.ts";
import type { RelayStage } from "../relay/config.ts";
import { resolveDepartment } from "../hierarchy/index.ts";
import { correctionOwner } from "../authorizations/index.ts";
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
 * Every authorization currently awaiting an Approver at `department`,
 * filtered from `authorizations` rather than reading the log itself - #59
 * added a second, independent queue (`listCorrectionQueue` below) that
 * `listMyQueue` in `service/index.ts` always consults alongside this one,
 * and passing the list in lets the caller fold the log once for both
 * instead of twice. An authorization leaves the moment its stage resolves,
 * because `currentStageId` itself moves on (#55) - there is nothing
 * separate to remove it from.
 */
export function listApproverQueue(
  authorizations: readonly Authorization[],
  db: DatabaseSync,
  department: string,
): Authorization[] {
  return authorizations.filter((authorization) => {
    if (authorization.awaitingCorrection) return false;
    const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
    return isAcknowledgeableStage(stage) && queueDepartment(db, authorization, stage) === department;
  });
}

/** Whether `participant` may act on `authorization`'s current stage - the
 *  one check behind both what appears in their queue and whether an
 *  acknowledgement or correction request they attempt is genuinely theirs
 *  to make. An authorization awaiting correction is excluded (#59,
 *  CONTEXT.md: "the approver who raised the request cannot act on it") -
 *  it left this Approver's queue the moment they raised it, and stays out
 *  until the correction lands. */
export function isQueuedFor(
  db: DatabaseSync,
  authorization: Authorization,
  participant: { role: string; department: string },
): boolean {
  if (participant.role !== "Approver") return false;
  if (authorization.awaitingCorrection) return false;
  const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  return isAcknowledgeableStage(stage) && queueDepartment(db, authorization, stage) === participant.department;
}

/**
 * Every authorization with an outstanding correction request addressed to
 * `participantId` (#59, CONTEXT.md: "an authorization out for correction
 * sits in the corrector's queue only"). Independent of role and department -
 * the submitter is a relationship to one authorization, not a role
 * (CONTEXT.md) - so `listMyQueue` in `service/index.ts` adds this to
 * whatever role-based queue it already computed, rather than routing
 * through the branches above.
 */
export function listCorrectionQueue(
  authorizations: readonly Authorization[],
  participantId: string,
): Authorization[] {
  return authorizations.filter(
    (authorization) =>
      authorization.awaitingCorrection &&
      correctionOwner(authorization, authorization.correctionRequest!.fields) === participantId,
  );
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
export function listContributorQueue(
  authorizations: readonly Authorization[],
  db: DatabaseSync,
  department: string,
): Authorization[] {
  return authorizations.filter((authorization) => {
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

/**
 * Every authorization sitting at the mint stage, not yet completed (#58,
 * CONTEXT.md: despite the name, "the Charge Number Admin ... is a stage in
 * the relay"). Not department-scoped like an Approver's or a Contributor's
 * queue: minting is a centralized administrative act tied to neither side,
 * so any Charge Number Admin sees it, the same way any holder of an
 * Approver's role at the right department may acknowledge (BDR-0013) - here
 * there is simply no department to narrow by. `chargeNumber` is what tells
 * a completed authorization apart from one still waiting, since resolving
 * the mint stage does not move `currentStageId` anywhere else for the
 * filter below to catch (`appendCompletionTransition` in
 * `authorizations/index.ts`).
 */
export function listChargeNumberAdminQueue(authorizations: readonly Authorization[]): Authorization[] {
  return authorizations.filter((authorization) => {
    if (authorization.chargeNumber !== null) return false;
    const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
    return isMintStage(stage);
  });
}

/** Whether `participant` may mint `authorization`'s charge number - a
 *  Charge Number Admin, while it sits at the mint stage and has not
 *  already been completed. */
export function isQueuedForMint(
  authorization: Authorization,
  participant: { role: string },
): boolean {
  if (participant.role !== "Charge Number Admin") return false;
  if (authorization.chargeNumber !== null) return false;
  const stage = RELAY_CONFIG.find((s) => s.id === authorization.currentStageId)!;
  return isMintStage(stage);
}
