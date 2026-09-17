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

/**
 * The four funding types (CONTEXT.md), in this project's own vocabulary rather
 * than the source form's. What the Contracts gate's condition is read from -
 * a later ticket's concern, not this one's; here they are just a bounded list
 * a draft may name.
 */
export const FUNDING_TYPE_VALUES = [
  "commercial-contract",
  "government-commercial-item-contract",
  "government-negotiated-contract",
  "company-funded",
] as const;

export type FundingType = (typeof FUNDING_TYPE_VALUES)[number];

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
  "commercial-contract": "Commercial contract",
  "government-commercial-item-contract": "Government commercial-item contract",
  "government-negotiated-contract": "Government negotiated contract",
  "company-funded": "Company funded",
};

/**
 * Domestic or international, entered on each side (CONTEXT.md). What the
 * Global Trade gate's condition is read from (BDR-0014) - again, a later
 * ticket's consumer.
 */
export const LOCATION_TYPE_VALUES = ["domestic", "international"] as const;

export type LocationType = (typeof LOCATION_TYPE_VALUES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  domestic: "Domestic",
  international: "International",
};

/**
 * Foreign or domestic, held on a department as the `jurisdiction` attribute
 * (ADR-0012) - what the seeded permissibility rule is evaluated against
 * (BDR-0007, #53). Distinct from `LocationType` above: that is entered on a
 * draft and describes where the work happens; this is inherited hierarchy
 * data and describes what the department itself is.
 */
export const JURISDICTION_VALUES = ["foreign", "domestic"] as const;

export type Jurisdiction = (typeof JURISDICTION_VALUES)[number];

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  foreign: "Foreign",
  domestic: "Domestic",
};

/**
 * The three levels the hierarchy is always three of (BDR-0004, ADR-0012),
 * whatever the source called them - what an Administrator's add, rename and
 * set-inactive commands act on (#64).
 */
export const NODE_KIND_VALUES = ["legal-entity", "division", "department"] as const;

export type NodeKind = (typeof NODE_KIND_VALUES)[number];

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  "legal-entity": "Legal entity",
  division: "Division",
  department: "Department",
};
