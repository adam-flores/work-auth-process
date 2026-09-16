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
 * The Charge Number Admin's mint is the relay's seventh and last stage
 * (#58, CONTEXT.md: despite the name, "the Charge Number Admin ... is a
 * stage in the relay"). It carries no `condition` - it always runs - and no
 * fixed queue `department` the way a gate does: minting is a centralized
 * administrative act tied to neither side, only one Charge Number Admin
 * role is ever seeded, and its queue (`queues/index.ts`) is scoped by role
 * alone rather than by department.
 */

/**
 * Which side of the authorization a stage's role belongs to. The four
 * mandatory approvals route to a role at one side's named department
 * (CONTEXT.md: "a stage routes to a role at a department") - `queues/index.ts`
 * (#55) reads `requestingDepartmentId` or `performingDepartmentId` off the
 * authorization itself for these. The two gates are centralized compliance
 * functions tied to neither side, and this did turn out to matter once
 * queues were built: resolved as a fixed department of its own per gate
 * (`GateStage.department`, "Contracts", "Global Trade"), seeded like any
 * other Approver's rather than drawn from the org hierarchy (#57).
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

/**
 * A stage a Contributor resolves by claiming and completing it, rather than
 * an Approver acknowledging it (#56, BDR-0003: "Contributor: claim
 * (performing side) - complete a contribution stage"). Exactly one exists
 * today - the performing department taking ownership of the authorization -
 * so this is not yet proven against a second case, but the shape is kept
 * distinct from `ApprovalStage` rather than reusing it under a different
 * label, since the two resolve by different acts and route to a different
 * role.
 */
export type ContributionStage = StageCommon & { readonly kind: "contribution" };

export type GateStage = StageCommon & {
  readonly kind: "gate";
  /** Whether this gate runs at all, read off the authorization's current
   *  field values. `false` means the gate is skipped - an explicit
   *  transition kind (ADR-0004), not silently absent from the log. */
  readonly condition: (fields: DraftFieldValues) => boolean;
  /** The fixed department a gate's queue routes to when it runs (#57) - a
   *  centralized compliance function tied to neither side, seeded like any
   *  other Approver's department (`config/participants.json`) rather than
   *  read off the authorization the way `side` is for the four mandatory
   *  approvals. */
  readonly department: string;
};

/**
 * The mint stage (#58): resolved by the Charge Number Admin supplying a
 * charge number rather than by an acknowledgement, the way `ContributionStage`
 * resolves by a Contributor's act rather than an Approver's. It is also the
 * relay's terminal stage - resolving it completes the authorization
 * (BDR-0003) rather than arriving at whatever comes next, since nothing
 * does.
 */
export type MintStage = StageCommon & { readonly kind: "mint" };

export type RelayStage = ApprovalStage | ContributionStage | GateStage | MintStage;

function approval(
  id: StageId,
  side: StageSide,
  fieldDependencies: readonly DraftFieldKey[],
): ApprovalStage {
  return { id, side, kind: "approval", concern: STAGE_CRITERIA[id].concern, fieldDependencies };
}

function contribution(
  id: StageId,
  side: StageSide,
  fieldDependencies: readonly DraftFieldKey[],
): ContributionStage {
  return { id, side, kind: "contribution", concern: STAGE_CRITERIA[id].concern, fieldDependencies };
}

function gate(
  id: StageId,
  side: StageSide,
  fieldDependencies: readonly DraftFieldKey[],
  condition: (fields: DraftFieldValues) => boolean,
  department: string,
): GateStage {
  return {
    id,
    side,
    kind: "gate",
    concern: STAGE_CRITERIA[id].concern,
    fieldDependencies,
    condition,
    department,
  };
}

function mint(id: StageId, fieldDependencies: readonly DraftFieldKey[]): MintStage {
  return { id, side: "neutral", kind: "mint", concern: STAGE_CRITERIA[id].concern, fieldDependencies };
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
  // No dependencies: nothing on the draft determines who claims it or what
  // employee they name (#56) - a correction to any intake field leaves the
  // claim standing.
  contribution("performing-department", "performing", []),
  approval("performing-program-manager", "performing", ["project", "performingDepartmentId"]),
  approval("performing-finance", "performing", ["resources"]),
  gate(
    "contracts",
    "neutral",
    ["fundingType"],
    // CONTEXT.md: company-funded work has no customer contract, so the gate
    // is skipped; the other three funding types all reach it.
    (fields) => fields.fundingType !== null && fields.fundingType !== "company-funded",
    "Contracts",
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
    "Global Trade",
  ),
  // No dependencies: minting supplies a value rather than rendering a
  // judgement (CONTEXT.md), so no correction to the form returns this stage
  // for re-review the way ADR-0005 lets a dependent field's correction do
  // to an approval.
  mint("charge-number-admin", []),
];

export function isGateStage(stage: RelayStage): stage is GateStage {
  return stage.kind === "gate";
}

export function isContributionStage(stage: RelayStage): stage is ContributionStage {
  return stage.kind === "contribution";
}

export function isMintStage(stage: RelayStage): stage is MintStage {
  return stage.kind === "mint";
}

/** The stage an authorization sits at the moment it is initiated - the relay's
 *  first entry, always. */
export function firstStage(): RelayStage {
  const stage = RELAY_CONFIG[0];
  if (!stage) throw new Error("The relay configuration names no stages.");
  return stage;
}
