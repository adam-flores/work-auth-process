import { STAGE_CRITERIA } from "../guidance/content.ts";
import type { DraftFieldKey, StageId } from "../guidance/content.ts";
import type { DraftFieldValues } from "../drafts/index.ts";

/**
 * The relay configuration (#54): one versioned, ordered artifact, held as a
 * module in the repository rather than a seeded row (ADR-0004, ADR-0011).
 * There is exactly one of these - the fixture generator and the router read
 * this same array - so there is no seeded copy for it to drift from.
 *
 * `StageId` and each stage's `concern` come from `guidance/content.ts`
 * (#52), which already named the six judging checkpoints and reserved this
 * file to build "the ordered artifact with side, kind and fieldDependencies"
 * around them. Nothing here duplicates that vocabulary.
 *
 * The Charge Number Admin's mint is deliberately not a stage here. CONTEXT.md
 * gives it no `concern` - it "supplies a value rather than rendering a
 * judgement" - and the business case's own count of controls (the four
 * mandatory acknowledgements plus the two gates) stops at these six. Minting
 * is the step after the relay closes, and it is a later ticket's build.
 */

/**
 * Which side of the authorization a stage's role belongs to. The four
 * mandatory approvals route to a role at one side's named department
 * (CONTEXT.md: "a stage routes to a role at a department") - `queues/index.ts`
 * (#55) reads `requestingDepartmentId` or `performingDepartmentId` off the
 * authorization itself for these. The two gates are centralized compliance
 * functions tied to neither side, and this did turn out to matter once
 * queues were built: resolved as a fixed department of its own per gate
 * ("Contracts", "Global Trade"), seeded like any other Approver's rather than
 * drawn from the org hierarchy. Not yet wired up - #57 builds the two gates
 * and is where that seeding belongs - so `queues/index.ts` throws on a
 * "neutral" stage today rather than guessing at a department that does not
 * exist yet.
 */
export type StageSide = "requesting" | "performing" | "neutral";

type StageCommon = {
  readonly id: StageId;
  readonly side: StageSide;
  readonly concern: string;
  /** The fields this stage's concern rests on (ADR-0005). A correction
   *  changing one of these returns the authorization here as a re-review.
   *  Empty means the concern rests on nothing in the form - the stage's
   *  sign-off survives every correction. */
  readonly fieldDependencies: readonly DraftFieldKey[];
};

export type ApprovalStage = StageCommon & { readonly kind: "approval" };

export type GateStage = StageCommon & {
  readonly kind: "gate";
  /** Whether this gate runs at all, read off the authorization's current
   *  field values. `false` means the gate is skipped - an explicit
   *  transition kind (ADR-0004), not silently absent from the log. */
  readonly condition: (fields: DraftFieldValues) => boolean;
};

export type RelayStage = ApprovalStage | GateStage;

function approval(
  id: StageId,
  side: StageSide,
  fieldDependencies: readonly DraftFieldKey[],
): ApprovalStage {
  return { id, side, kind: "approval", concern: STAGE_CRITERIA[id].concern, fieldDependencies };
}

function gate(
  id: StageId,
  side: StageSide,
  fieldDependencies: readonly DraftFieldKey[],
  condition: (fields: DraftFieldValues) => boolean,
): GateStage {
  return { id, side, kind: "gate", concern: STAGE_CRITERIA[id].concern, fieldDependencies, condition };
}

/**
 * Order matches the flow document exactly (docs/process/work-authorization-flow.md):
 * requesting side, then performing side, then Contracts, then Global Trade.
 * ADR-0001's "preserve the flow" promise is what fixes this order - reordering
 * it is a configuration edit, not a rebuild.
 */
export const RELAY_CONFIG: readonly RelayStage[] = [
  approval("requesting-program-manager", "requesting", [
    "project",
    "requestingDepartmentId",
    "performingDepartmentId",
  ]),
  // No dependencies: the requesting finance approver confirms funding that
  // exists outside this process (ADR-0005's live case), so no correction to
  // the form can invalidate this sign-off.
  approval("requesting-finance", "requesting", []),
  approval("performing-program-manager", "performing", ["project", "performingDepartmentId"]),
  approval("performing-finance", "performing", ["resources"]),
  gate(
    "contracts",
    "neutral",
    ["fundingType"],
    // CONTEXT.md: company-funded work has no customer contract, so the gate
    // is skipped; the other three funding types all reach it.
    (fields) => fields.fundingType !== null && fields.fundingType !== "company-funded",
  ),
  gate(
    "global-trade",
    "neutral",
    ["requestingLocationType", "performingLocationType"],
    // BDR-0014: triggers when the two sides' declared location types differ.
    (fields) =>
      fields.requestingLocationType !== null &&
      fields.performingLocationType !== null &&
      fields.requestingLocationType !== fields.performingLocationType,
  ),
];

export function isGateStage(stage: RelayStage): stage is GateStage {
  return stage.kind === "gate";
}

/** The stage an authorization sits at the moment it is initiated - the relay's
 *  first entry, always. */
export function firstStage(): RelayStage {
  const stage = RELAY_CONFIG[0];
  if (!stage) throw new Error("The relay configuration names no stages.");
  return stage;
}
