import type {
  Participant,
  AttributeFilter,
  DraftFieldsInput,
  PermissibilityRuleInput,
  ResourceInput,
} from "../shared/rules.ts";
import type { ResolvedDepartment } from "../hierarchy/index.ts";
import type { Draft } from "../drafts/index.ts";
import type { PermissibilityRule } from "../permissibility/index.ts";
import type { Authorization, CorrectableFieldKey } from "../authorizations/index.ts";
import type { CorrectionFieldValuesInput } from "../shared/rules.ts";

export type { ResolvedDepartment, Attribute } from "../hierarchy/index.ts";
export type { Draft, Resource } from "../drafts/index.ts";
export type { PermissibilityRule } from "../permissibility/index.ts";
export type {
  Authorization,
  CorrectableFieldKey,
  CorrectionRequest,
  StageVisit,
} from "../authorizations/index.ts";

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

async function call<T>(
  path: string,
  actingParticipantId: string,
  method = "GET",
  payload?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "x-acting-participant": actingParticipantId,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
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

  createDraft: (actor: string, fields: DraftFieldsInput = {}) => call<Draft>("/api/drafts", actor, "POST", fields),
  listMyDrafts: (actor: string) => call<Draft[]>("/api/drafts", actor),
  getDraft: (actor: string, draftId: string) => call<Draft>(`/api/drafts/${encodeURIComponent(draftId)}`, actor),
  updateDraft: (actor: string, draftId: string, fields: DraftFieldsInput) =>
    call<Draft>(`/api/drafts/${encodeURIComponent(draftId)}`, actor, "PATCH", fields),
  deleteDraft: (actor: string, draftId: string) =>
    call<{ deleted: true }>(`/api/drafts/${encodeURIComponent(draftId)}`, actor, "DELETE"),
  addResource: (actor: string, draftId: string, resource: ResourceInput) =>
    call<Draft>(`/api/drafts/${encodeURIComponent(draftId)}/resources`, actor, "POST", resource),
  removeResource: (actor: string, draftId: string, resourceId: string) =>
    call<Draft>(
      `/api/drafts/${encodeURIComponent(draftId)}/resources/${encodeURIComponent(resourceId)}`,
      actor,
      "DELETE",
    ),
  initiateDraft: (actor: string, draftId: string) =>
    call<Authorization>(`/api/drafts/${encodeURIComponent(draftId)}/initiate`, actor, "POST"),

  getAuthorization: (actor: string, authorizationId: string) =>
    call<Authorization>(`/api/authorizations/${encodeURIComponent(authorizationId)}`, actor),
  listMyQueue: (actor: string) => call<Authorization[]>("/api/queue", actor),
  acknowledge: (actor: string, authorizationId: string) =>
    call<Authorization>(`/api/authorizations/${encodeURIComponent(authorizationId)}/acknowledge`, actor, "POST"),
  claim: (actor: string, authorizationId: string) =>
    call<Authorization>(`/api/authorizations/${encodeURIComponent(authorizationId)}/claim`, actor, "POST"),
  contribute: (actor: string, authorizationId: string, fields: { performingEmployee: string }) =>
    call<Authorization>(
      `/api/authorizations/${encodeURIComponent(authorizationId)}/contribute`,
      actor,
      "POST",
      fields,
    ),
  requestCorrection: (
    actor: string,
    authorizationId: string,
    input: { fields: CorrectableFieldKey[]; comment: string },
  ) =>
    call<Authorization>(
      `/api/authorizations/${encodeURIComponent(authorizationId)}/request-correction`,
      actor,
      "POST",
      input,
    ),
  correct: (actor: string, authorizationId: string, fields: CorrectionFieldValuesInput) =>
    call<Authorization>(`/api/authorizations/${encodeURIComponent(authorizationId)}/correct`, actor, "POST", fields),

  listPermissibilityRules: (actor: string) =>
    call<PermissibilityRule[]>("/api/permissibility-rules", actor),
  addPermissibilityRule: (actor: string, rule: PermissibilityRuleInput) =>
    call<PermissibilityRule>("/api/permissibility-rules", actor, "POST", rule),
  removePermissibilityRule: (actor: string, ruleId: string) =>
    call<{ deleted: true }>(
      `/api/permissibility-rules/${encodeURIComponent(ruleId)}`,
      actor,
      "DELETE",
    ),
};
