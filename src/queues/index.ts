import type { DatabaseSync } from "node:sqlite";
import { RELAY_CONFIG } from "../relay/config.ts";
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
 * functions tied to neither side (`relay/config.ts`), and how their queues
 * are staffed was an open question this ticket's own scaffold flagged.
 * Decided in conversation rather than left implicit: each gate gets a fixed
 * department of its own ("Contracts", "Global Trade"), seeded like any other
 * Approver's, once #57 builds the two gates. Nothing routes an authorization
 * to one on purpose yet - #55 and #56 are the four mandatory approvals only -
 * but `appendAcknowledgementTransition` has no gate-awareness and will walk
 * an authorization straight into one if acknowledged four times in a row.
 * `null` here, rather than throwing, is what keeps that from 500ing every
 * Approver's queue in the meantime: an authorization at a stage with no
 * queue department is simply in nobody's queue, until #57 gives it one.
 */
function queueDepartment(db: DatabaseSync, authorization: Authorization, stage: RelayStage): string | null {
  switch (stage.side) {
    case "requesting":
      return resolveDepartment(db, authorization.requestingDepartmentId)!.name;
    case "performing":
      return resolveDepartment(db, authorization.performingDepartmentId)!.name;
    case "neutral":
      return null;
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
    return queueDepartment(db, authorization, stage) === department;
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
  return queueDepartment(db, authorization, stage) === participant.department;
}
