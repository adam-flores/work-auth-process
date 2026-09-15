import type { Participant, AttributeFilter } from "../shared/rules.ts";
import type { ResolvedDepartment } from "../hierarchy/index.ts";

export type { ResolvedDepartment, Attribute } from "../hierarchy/index.ts";

/** What the service returns about the store it is reading. */
export type StoreInfo = {
  schemaVersion: number;
  seededAt: string;
  participantCount: number;
  departmentCount: number;
};

export type DepartmentQueryParams = {
  text?: string;
  attributes?: AttributeFilter[];
  legalEntityId?: string;
  divisionId?: string;
};

export class ApiError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, actingParticipantId: string, method = "GET"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "x-acting-participant": actingParticipantId },
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, code } = body as { error?: string; code?: string };
    throw new ApiError(error ?? `Request failed (${res.status}).`, code);
  }
  return body as T;
}

/**
 * An attribute filter travels as a repeated `attr` param, `name:value` each -
 * the server side of this encoding is `parseDepartmentQuery` in
 * `src/server/index.ts`.
 */
function departmentQueryString(query: DepartmentQueryParams): string {
  const params = new URLSearchParams();
  if (query.text) params.set("text", query.text);
  if (query.legalEntityId) params.set("legalEntityId", query.legalEntityId);
  if (query.divisionId) params.set("divisionId", query.divisionId);
  for (const { name, value } of query.attributes ?? []) params.append("attr", `${name}:${value}`);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  listParticipants: (actor: string) => call<Participant[]>("/api/participants", actor),
  getStoreInfo: (actor: string) => call<StoreInfo>("/api/store", actor),
  resetStore: (actor: string) => call<StoreInfo>("/api/store/reset", actor, "POST"),

  /** Narrow on attributes, search what remains by name (BDR-0008). Every part
   *  of `query` is optional and combinable, in any order. */
  searchDepartments: (actor: string, query: DepartmentQueryParams = {}) =>
    call<ResolvedDepartment[]>(`/api/departments${departmentQueryString(query)}`, actor),

  getDepartment: (actor: string, departmentId: string) =>
    call<ResolvedDepartment>(`/api/departments/${encodeURIComponent(departmentId)}`, actor),
};
