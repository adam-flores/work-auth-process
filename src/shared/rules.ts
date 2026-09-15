import { z } from "zod";
import { FUNDING_TYPE_VALUES, LOCATION_TYPE_VALUES } from "./constants.ts";

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

/** A name typed in free text, not a participant on the roster (BDR-0013): the
 *  four named approvers and the optional performing-side contact. Present but
 *  blank is refused rather than silently kept - the caller clears a field by
 *  sending `null`, not by sending whitespace. */
const NamedPerson = z.string().trim().min(1, "A name may not be blank.").max(200).nullish();

export const ProjectName = z
  .string()
  .trim()
  .min(1, "A project name may not be blank.")
  .max(200)
  .nullish();

export const ResourceInput = z.object({
  budgetHours: z.number().positive("Budget hours must be greater than zero."),
  laborRate: z.number().positive("Labor rate must be greater than zero."),
});

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
  .refine(
    (fields) =>
      !fields.requestingDepartmentId ||
      !fields.performingDepartmentId ||
      fields.requestingDepartmentId !== fields.performingDepartmentId,
    {
      message: "The requesting and performing department may not be the same.",
      path: ["performingDepartmentId"],
    },
  );

export type FundingType = z.infer<typeof FundingType>;
export type LocationType = z.infer<typeof LocationType>;
export type ResourceInput = z.infer<typeof ResourceInput>;
export type DraftFields = z.infer<typeof DraftFields>;
export type DraftFieldsInput = z.input<typeof DraftFields>;

export { SYSTEM_PARTICIPANT_ID, FUNDING_TYPE_VALUES, LOCATION_TYPE_VALUES } from "./constants.ts";
