/**
 * Constants with no dependencies, so importing one into the browser does not
 * drag a validation library in with it.
 */

/**
 * The one identity that is not on the roster. It stands for the product acting
 * on its own behalf - seeding, resetting, and reading before anybody has chosen
 * who they are. A real build replaces it with an authenticated principal.
 */
export const SYSTEM_PARTICIPANT_ID = "system";
