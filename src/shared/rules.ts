import { z } from "zod";
import { FUNDING_TYPE_VALUES, JURISDICTION_VALUES, LOCATION_TYPE_VALUES } from "./constants.ts";
import type { CorrectableFieldKey } from "../authorizations/index.ts";

/**
 * Rules expressed once and imported by both the browser and the service
 * (ADR-0002, ADR-0010). Nothing in here may touch the DOM or the store: the
 * whole point is that one module runs in both places.
 *
 * The browser's copy is for immediacy and guidance. It is never the
 * enforcement - every command re-validates on the way in.
 */

export const ParticipantId = z
  .string()
  .trim()
  .min(1, "An acting participant is required.")
  .regex(/^[a-z0-9-]+$/, "A participant id is lowercase letters, digits and hyphens.");

/** The four roles of the cast in CONTEXT.md. Submitter is deliberately absent: it
 *  is a relationship to one authorization, not a role somebody holds. */
export const ParticipantRole = z.enum([
  "Contributor",
  "Approver",
  "Charge Number Admin",
  "Administrator",
]);

export const Participant = z.object({
  id: ParticipantId,
  name: z.string().trim().min(1),
  role: ParticipantRole,
  department: z.string().trim().min(1),
});

/** Who is acting. Every service function takes one; nothing reads a session. */
export const ActingParticipant = z.object({ participantId: ParticipantId });

/**
 * The id of anything in the hierarchy - a legal entity, a division, a
 * department. Derived from a name once, at seeding, and never shown to anyone:
 * it is what a record holds instead of three keyed-in levels
 * (ADR-0012).
 */
export const HierarchyId = z
  .string()
  .trim()
  .min(1, "A hierarchy id is required.")
  .regex(/^[a-z0-9-]+$/, "A hierarchy id is lowercase letters, digits and hyphens.");

/**
 * One narrowing of the department list. An attribute is a name and a value, and
 * nothing here knows which names exist: they are data in the hierarchy, not a
 * list in code, so a new one narrows the picker without a change here
 * (BDR-0008).
 */
export const AttributeFilter = z.object({
  name: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

/**
 * What the picker asks for. Every part is optional, in any combination, with no
 * order imposed - a submitter certain of nothing searches cold.
 */
export const DepartmentQuery = z.object({
  text: z.string().trim().default(""),
  attributes: z.array(AttributeFilter).default([]),
  legalEntityId: HierarchyId.optional(),
  divisionId: HierarchyId.optional(),
  /** Inactive departments are closed to new authorizations, so the picker never
   *  asks for them. An administrative or historical read does. */
  includeInactive: z.boolean().default(false),
});

export type AttributeFilter = z.infer<typeof AttributeFilter>;
export type HierarchyId = z.infer<typeof HierarchyId>;
export type DepartmentQuery = z.infer<typeof DepartmentQuery>;
export type DepartmentQueryInput = z.input<typeof DepartmentQuery>;
export type ParticipantRole = z.infer<typeof ParticipantRole>;
export type Participant = z.infer<typeof Participant>;
export type ActingParticipant = z.infer<typeof ActingParticipant>;

/**
 * A draft (ADR-0009). Every field is `nullish`, on purpose and uniformly:
 * a draft is allowed to be incomplete, so "not yet supplied" has to be
 * expressible for every one of them, and the service saves a draft as a
 * whole rather than patching one field at a time - the caller always sends
 * every field it knows, and `null` is how it says "nothing here."
 *
 * Completeness is a different, stricter pass over this same shape, required
 * only at initiation (BDR-0013) - a later ticket, not this one.
 */
export const FundingType = z.enum(FUNDING_TYPE_VALUES);
export const LocationType = z.enum(LOCATION_TYPE_VALUES);

/**
 * A name typed in free text (BDR-0013): the four named approvers and the
 * optional performing-side contact. Defined once as the required case and
 * relaxed to nullish for the draft - present but blank is refused rather
 * than silently kept, at both strictnesses, because the caller clears a
 * field by sending `null`, not by sending whitespace.
 */
export const NamedPersonRequired = z.string().trim().min(1, "A name may not be blank.").max(200);
const NamedPerson = NamedPersonRequired.nullish();

export const ProjectNameRequired = z
  .string()
  .trim()
  .min(1, "A project name may not be blank.")
  .max(200);
export const ProjectName = ProjectNameRequired.nullish();

/**
 * What a contributor supplies to complete the performing-department stage
 * (#56): the employee who will perform the work - "a name on the record, not
 * a participant in the process" (CONTEXT.md), so the same free-text rule a
 * named approver follows applies here too, rather than a lookup against the
 * roster.
 */
export const ContributeFields = z.object({
  performingEmployee: NamedPersonRequired,
});
export type ContributeFields = z.infer<typeof ContributeFields>;
export type ContributeFieldsInput = z.input<typeof ContributeFields>;

/**
 * What the Charge Number Admin supplies to mint (#58, CONTEXT.md: "Charge
 * number" - "the code the performing team books time against"). Free text,
 * the same discipline a named person's name follows: present but blank is
 * refused rather than silently kept.
 */
export const MintFields = z.object({
  chargeNumber: z.string().trim().min(1, "A charge number is required.").max(200),
});
export type MintFields = z.infer<typeof MintFields>;
export type MintFieldsInput = z.input<typeof MintFields>;

/**
 * What the referrer supplies to refer an authorization to a colleague (#62,
 * BDR-0011): the colleague to show it to. A participant id, not a free-text
 * name like a named approver or the performing-side contact - BDR-0011
 * assumes the colleague can already read the authorization, which only a
 * known participant can (`requireParticipant` in `service/index.ts`).
 */
export const ReferralInput = z.object({
  colleagueId: ParticipantId,
});
export type ReferralInput = z.infer<typeof ReferralInput>;
export type ReferralInputInput = z.input<typeof ReferralInput>;

export const ResourceInput = z.object({
  budgetHours: z.number().positive("Budget hours must be greater than zero."),
  laborRate: z.number().positive("Labor rate must be greater than zero."),
});

/**
 * Every field a correction request may name (#59): every field a draft
 * carries, plus `performingEmployee` - see `CorrectableFieldKey` in
 * `authorizations/index.ts` for why that one field is different from the
 * rest. `satisfies` keeps this array and that type from drifting apart
 * silently, the same discipline `FUNDING_TYPE_VALUES` already keeps with
 * `FundingType`.
 */
export const CORRECTABLE_FIELD_KEYS = [
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
  "performingContact",
  "resources",
  "performingEmployee",
] as const satisfies readonly CorrectableFieldKey[];

const CommentRequired = z.string().trim().min(1, "A comment is required.").max(2000);

/**
 * What an Approver supplies to raise a correction request (#59, BDR-0005):
 * the fields at fault and a mandatory comment to their owner. A field may
 * not be named twice - nothing about naming it again says anything a single
 * mention did not already say.
 */
export const CorrectionRequestInput = z.object({
  fields: z
    .array(z.enum(CORRECTABLE_FIELD_KEYS))
    .min(1, "Name at least one field.")
    .refine((fields) => new Set(fields).size === fields.length, "A field may not be named twice."),
  comment: CommentRequired,
});
export type CorrectionRequestInput = z.infer<typeof CorrectionRequestInput>;

/**
 * What the field's owner supplies to correct it (#59, CONTEXT.md:
 * "the field's owner supplying the fix"). Every field but
 * `performingDepartmentId` - fixed at initiation and never correctable
 * (BDR-0012) - since a correction request naming it can be raised but never
 * satisfied this way - the service refuses that case itself, reading it off
 * the outstanding request before this schema is ever reached, so a caller
 * sending it here is told the real reason rather than a generic shape
 * error. Reuses the exact validator each field's draft counterpart uses, so
 * a corrected value can never be valid where an initial one would have
 * been refused, or the reverse. Left non-strict, same as `ContributeFields`
 * above: a correction and its `TransitionOptions.occurredAt` travel in one
 * request body, so an unrecognized `occurredAt` key here has to be ignored
 * rather than refused.
 */
export const CorrectionFieldValues = z
  .object({
    project: ProjectNameRequired,
    requestingDepartmentId: HierarchyId,
    fundingType: FundingType,
    requestingLocationType: LocationType,
    performingLocationType: LocationType,
    requestingProgramManager: NamedPersonRequired,
    requestingFinanceApprover: NamedPersonRequired,
    performingProgramManager: NamedPersonRequired,
    performingFinanceApprover: NamedPersonRequired,
    performingContact: NamedPerson,
    resources: z.array(ResourceInput).min(1, "At least one resource is required."),
    performingEmployee: NamedPersonRequired,
  })
  .partial();
export type CorrectionFieldValues = z.infer<typeof CorrectionFieldValues>;
export type CorrectionFieldValuesInput = z.input<typeof CorrectionFieldValues>;

/**
 * The requesting and performing department may never name the same
 * department, at either strictness (#52) - written once and applied by both
 * `DraftFields` and `CompleteDraftFields` below, so the two schemas cannot
 * drift on what is otherwise the same check applied twice.
 */
function departmentsDiffer(fields: {
  requestingDepartmentId?: string | null;
  performingDepartmentId?: string | null;
}): boolean {
  return (
    !fields.requestingDepartmentId ||
    !fields.performingDepartmentId ||
    fields.requestingDepartmentId !== fields.performingDepartmentId
  );
}
const DEPARTMENTS_DIFFER_ISSUE = {
  message: "The requesting and performing department may not be the same.",
  path: ["performingDepartmentId"] as PropertyKey[],
};

export const DraftFields = z
  .object({
    project: ProjectName,
    requestingDepartmentId: HierarchyId.nullish(),
    performingDepartmentId: HierarchyId.nullish(),
    fundingType: FundingType.nullish(),
    requestingLocationType: LocationType.nullish(),
    performingLocationType: LocationType.nullish(),
    requestingProgramManager: NamedPerson,
    requestingFinanceApprover: NamedPerson,
    performingProgramManager: NamedPerson,
    performingFinanceApprover: NamedPerson,
    performingContact: NamedPerson,
  })
  .refine(departmentsDiffer, DEPARTMENTS_DIFFER_ISSUE);

/**
 * The same shape, evaluated at initiation's strictness rather than a
 * draft's (#52, business case §10 assumption 14: "every field ... is
 * required"). One rule set, not two: every field below reuses the exact
 * validator `DraftFields` relaxes to nullish, so the two schemas can never
 * disagree about what a *valid* project name or a *valid* named person is -
 * only about whether one is required at all.
 *
 * `resources` sits outside `DraftFields` because it is not part of a
 * draft's save-as-a-whole payload (BDR-0007's lines are added and removed
 * immediately, not staged) - completeness reads it as the draft's current
 * resource list, held alongside these fields rather than folded into them.
 *
 * `performingContact` stays nullish even here: BDR-0013 requires a named
 * person only for the four accountable roles, and is explicit that the
 * performing-side contact is a separate, optional notification - not one
 * of the fields assumption 14 makes mandatory.
 */
export const CompleteDraftFields = z
  .object({
    project: ProjectNameRequired,
    requestingDepartmentId: HierarchyId,
    performingDepartmentId: HierarchyId,
    fundingType: FundingType,
    requestingLocationType: LocationType,
    performingLocationType: LocationType,
    requestingProgramManager: NamedPersonRequired,
    requestingFinanceApprover: NamedPersonRequired,
    performingProgramManager: NamedPersonRequired,
    performingFinanceApprover: NamedPersonRequired,
    performingContact: NamedPerson,
    resources: z
      .array(ResourceInput)
      .min(1, "At least one resource is required to initiate."),
  })
  .refine(departmentsDiffer, DEPARTMENTS_DIFFER_ISSUE);

export type FundingType = z.infer<typeof FundingType>;
export type LocationType = z.infer<typeof LocationType>;
export type ResourceInput = z.infer<typeof ResourceInput>;
export type DraftFields = z.infer<typeof DraftFields>;
export type DraftFieldsInput = z.input<typeof DraftFields>;
export type CompleteDraftFields = z.infer<typeof CompleteDraftFields>;

/**
 * What a caller may say about a transition it is causing (#54, ADR-0004: "a
 * transition carries ... its timestamp, the timestamp supplied by the caller
 * and defaulted from the clock"). `occurredAt` is business time, not the
 * log's append order - the store's `transitions.seq` is what that is read
 * from, never this.
 */
export const TransitionOptions = z.object({
  occurredAt: z.string().datetime({ message: "occurredAt must be an ISO 8601 timestamp." }).optional(),
});

export type TransitionOptions = z.infer<typeof TransitionOptions>;
export type TransitionOptionsInput = z.input<typeof TransitionOptions>;

/**
 * A permissibility rule (#53, BDR-0007): a pairing of jurisdictions that may
 * not work together, held as data rather than code so a new pairing costs no
 * build. The seeded rule reads "a foreign department may not perform work
 * for a domestic one" as `requestingJurisdiction: "domestic"`,
 * `performingJurisdiction: "foreign"` - direction matters, since the reverse
 * pairing is not what the rule names.
 */
export const Jurisdiction = z.enum(JURISDICTION_VALUES);
export const PermissibilityRuleInput = z.object({
  requestingJurisdiction: Jurisdiction,
  performingJurisdiction: Jurisdiction,
});

export type Jurisdiction = z.infer<typeof Jurisdiction>;
export type PermissibilityRuleInput = z.infer<typeof PermissibilityRuleInput>;

export { SYSTEM_PARTICIPANT_ID, FUNDING_TYPE_VALUES, LOCATION_TYPE_VALUES, JURISDICTION_VALUES } from "./constants.ts";
