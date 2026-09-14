import { z } from "zod";

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
  legalEntityId: z.string().trim().min(1).optional(),
  divisionId: z.string().trim().min(1).optional(),
  /** Inactive departments are closed to new authorizations, so the picker never
   *  asks for them. An administrative or historical read does. */
  includeInactive: z.boolean().default(false),
});

export type AttributeFilter = z.infer<typeof AttributeFilter>;
export type DepartmentQuery = z.infer<typeof DepartmentQuery>;
export type DepartmentQueryInput = z.input<typeof DepartmentQuery>;
export type ParticipantRole = z.infer<typeof ParticipantRole>;
export type Participant = z.infer<typeof Participant>;
export type ActingParticipant = z.infer<typeof ActingParticipant>;

export { SYSTEM_PARTICIPANT_ID } from "./constants.ts";
