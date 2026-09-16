/**
 * Guidance content (#52): criteria and field guidance, authored as versioned
 * content in the repository rather than through an in-product authoring
 * surface (ADR-0011). Ownership is unchanged - the role accountable for a
 * judgement writes what it checks for and why - only where the authoring
 * happens moves, to a reviewed change here.
 *
 * Depends on neither the DOM nor the store, so it is as free to import into
 * the browser as `shared/rules.ts` is: guidance is read by the form at the
 * point of entry, and criteria will be read by an approver's queue once one
 * exists (a later ticket).
 *
 * `StageId` names the six judging checkpoints the flow document and the
 * business case already describe - the four mandatory approvals and the two
 * conditional gates (docs/process/work-authorization-flow.md) - plus
 * `performing-department`, the one stage that is not a judgement: the
 * performing department claiming ownership and naming who does the work
 * (#56). It is a vocabulary for addressing criteria by stage, not the relay
 * configuration itself: the ordered artifact with side, kind and
 * fieldDependencies that ADR-0004 and ADR-0011 describe is #54's build, and
 * nothing here assumes its shape.
 */

export type StageId =
  | "requesting-program-manager"
  | "requesting-finance"
  | "performing-department"
  | "performing-program-manager"
  | "performing-finance"
  | "contracts"
  | "global-trade"
  | "charge-number-admin";

export type StageCriteria = {
  /** What this stage judges - the attribute that tells two otherwise
   *  identical approvers apart (BDR-0002). */
  concern: string;
  /** The condition the field(s) below must satisfy to pass this stage,
   *  authored by the role accountable for the judgement. */
  criteria: string;
};

export const STAGE_CRITERIA: Record<StageId, StageCriteria> = {
  "requesting-program-manager": {
    concern: "scope",
    criteria:
      "The project and both departments describe one coherent ask, and the requesting " +
      "department is genuinely the one originating the work.",
  },
  "requesting-finance": {
    concern: "funds available",
    criteria: "The requesting department has budget behind the resources requested.",
  },
  "performing-department": {
    concern: "ownership",
    criteria:
      "A contributor in the performing department has claimed the authorization and named the " +
      "employee who will perform the work.",
  },
  "performing-program-manager": {
    concern: "scope",
    criteria: "The performing department can take on the described work.",
  },
  "performing-finance": {
    concern: "cost estimate",
    criteria: "The budget hours and labor rate reflect a realistic estimate for the work.",
  },
  contracts: {
    concern: "contract terms",
    criteria:
      "The authorization is consistent with the funding type's contract terms, under the " +
      "exception rules that type triggers.",
  },
  "global-trade": {
    concern: "export",
    criteria:
      "The declared location types match the export jurisdiction and classification the " +
      "work requires.",
  },
  "charge-number-admin": {
    concern: "charge number",
    criteria:
      "A charge number exists for the performing team to book time against. This stage " +
      "supplies a value rather than rendering a judgement - completion follows from the " +
      "number existing, not from a decision made here.",
  },
} as const;

/** Every field a submitter enters on a draft (`DraftFields` /
 *  `CompleteDraftFields` in `shared/rules.ts`), plus `resources` - the one
 *  part of a draft that lives outside that shape. */
export type DraftFieldKey =
  | "project"
  | "requestingDepartmentId"
  | "performingDepartmentId"
  | "fundingType"
  | "requestingLocationType"
  | "performingLocationType"
  | "requestingProgramManager"
  | "requestingFinanceApprover"
  | "performingProgramManager"
  | "performingFinanceApprover"
  | "performingContact"
  | "resources";

export type FieldGuidance = {
  /** The stage whose criteria this field serves, and therefore whose role
   *  wrote the guidance - `null` where no stage's criteria covers the field
   *  (the performing-side contact is informational only, not judged). */
  ownerStage: StageId | null;
  /** The written explanation shown at the point of entry: what is needed
   *  and why. */
  text: string;
};

export const FIELD_GUIDANCE: Record<DraftFieldKey, FieldGuidance> = {
  project: {
    ownerStage: "requesting-program-manager",
    text:
      "Name the work as one ask. A project groups everything under a single authorization " +
      "rather than a container of unrelated work (BDR-0007).",
  },
  requestingDepartmentId: {
    ownerStage: "requesting-program-manager",
    text:
      "Search and select your own department. Getting this right the first time matters most: " +
      "a misrouted request usually lands in the wrong queue and takes days to find its way back.",
  },
  performingDepartmentId: {
    ownerStage: "performing-program-manager",
    text:
      "Search and select the department that will actually do the work. It must differ from " +
      "the requesting department, and it is fixed once the authorization is initiated.",
  },
  fundingType: {
    ownerStage: "contracts",
    text:
      "Choose how the work is funded. Company-funded work skips the Contracts stage entirely; " +
      "each contract type triggers its own exception rules once it reaches Contracts.",
  },
  requestingLocationType: {
    ownerStage: "global-trade",
    text:
      "Domestic or international, as it applies to the requesting side. This is what decides " +
      "whether the Global Trade stage runs at all.",
  },
  performingLocationType: {
    ownerStage: "global-trade",
    text:
      "Domestic or international, as it applies to the performing side. Global Trade compares " +
      "both sides' locations against the declared scope.",
  },
  requestingProgramManager: {
    ownerStage: "requesting-program-manager",
    text:
      "Name the person accountable for this work on the requesting side. This names an owner; " +
      "it does not change who may act at this stage (BDR-0013).",
  },
  requestingFinanceApprover: {
    ownerStage: "requesting-finance",
    text:
      "Name the person accountable for the requesting side's budget. Required so the spend has " +
      "a named owner, not because the stage routes to them personally (BDR-0013).",
  },
  performingProgramManager: {
    ownerStage: "performing-program-manager",
    text: "Name the person accountable for this work on the performing side.",
  },
  performingFinanceApprover: {
    ownerStage: "performing-finance",
    text: "Name the person accountable for the performing side's cost estimate.",
  },
  performingContact: {
    ownerStage: null,
    text:
      "Optional. Naming someone here only adds a notification on the performing side - it does " +
      "not reserve the work or name who will do it.",
  },
  resources: {
    ownerStage: "performing-finance",
    text:
      "List each resource's budget hours and labor rate. At least one is required before this " +
      "authorization can be initiated; add and remove lines freely while it is a draft.",
  },
} as const;
