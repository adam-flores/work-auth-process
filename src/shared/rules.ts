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

export type ParticipantRole = z.infer<typeof ParticipantRole>;
export type Participant = z.infer<typeof Participant>;
export type ActingParticipant = z.infer<typeof ActingParticipant>;

/**
 * The one identity that is not on the roster. It stands for the product acting
 * on its own behalf - seeding, resetting, and reading before anybody has chosen
 * who they are. A real build replaces it with an authenticated principal.
 */
export const SYSTEM_PARTICIPANT_ID = "system";
