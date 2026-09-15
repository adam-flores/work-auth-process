/**
 * A failure the domain recognises, as opposed to a bug. The HTTP adapter maps
 * `code` to a status through a lookup table - it never inspects domain state to
 * decide (ADR-0010).
 */
export type DomainErrorCode =
  | "UNKNOWN_PARTICIPANT"
  | "UNKNOWN_DEPARTMENT"
  | "UNKNOWN_DRAFT"
  | "UNKNOWN_RESOURCE"
  | "UNKNOWN_AUTHORIZATION"
  | "NOT_DRAFT_OWNER"
  | "DRAFT_INCOMPLETE"
  | "INVALID_REQUEST";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
