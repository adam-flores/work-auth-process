import type {
  Participant,
  AttributeFilter,
  DraftFieldsInput,
  MintFieldsInput,
  PermissibilityRuleInput,
  ResourceInput,
} from "../shared/rules.ts";
import type { NodeKind } from "../shared/constants.ts";
import type { HierarchyChange, HierarchyNode, ResolvedDepartment } from "../hierarchy/index.ts";
import type { Draft } from "../drafts/index.ts";
import type { PermissibilityRule } from "../permissibility/index.ts";
import type { Authorization, CorrectableFieldKey, FrozenClassification } from "../authorizations/index.ts";
import type { CorrectionFieldValuesInput } from "../shared/rules.ts";

export type { ResolvedDepartment, Attribute } from "../hierarchy/index.ts";
export type { HierarchyChange, HierarchyNode } from "../hierarchy/index.ts";
export type { NodeKind } from "../shared/constants.ts";
export type { Draft, Resource } from "../drafts/index.ts";
export type { PermissibilityRule } from "../permissibility/index.ts";
export type {
  Authorization,
  CorrectableFieldKey,
  CorrectionRequest,
  FrozenClassification,
  StageVisit,
} from "../authorizations/index.ts";

/** What `api.addHierarchyNode` sends - mirrors `AddHierarchyNodeInput`'s
 *  discriminated union (`shared/rules.ts`) without importing zod into the
 *  browser bundle for a type alone. */
export type AddHierarchyNodeInput =
  | { nodeKind: "legal-entity"; name: string }
  | { nodeKind: "division"; name: string; legalEntityId: string }
  | { nodeKind: "department"; name: string; divisionId: string };

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
  /** An administrative or historical read, unlike the picker's own search
   *  (#64: an Administrator's hierarchy view needs an inactive department
   *  to close, rename or simply see, not only the ones a submitter may
   *  still name). */
  includeInactive?: boolean;
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
  if (query.includeInactive) params.set("includeInactive", "true");
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
  listDashboard: (actor: string) => call<{ authorizations: Authorization[]; drafts: Draft[] }>("/api/dashboard", actor),
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
  mintChargeNumber: (actor: string, authorizationId: string, fields: MintFieldsInput) =>
    call<Authorization>(`/api/authorizations/${encodeURIComponent(authorizationId)}/mint`, actor, "POST", fields),
  getClassification: (actor: string, authorizationId: string) =>
    call<{ requesting: FrozenClassification; performing: FrozenClassification }>(
      `/api/authorizations/${encodeURIComponent(authorizationId)}/classification`,
      actor,
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

  /** What a submitter is told about their own authorizations after they
   *  left the relay without them (#64, CONTEXT.md: "Notification"). */
  listMyRevocations: (actor: string) => call<Authorization[]>("/api/revocations", actor),

  listLegalEntities: (actor: string) => call<HierarchyNode[]>("/api/hierarchy/legal-entities", actor),
  listDivisions: (actor: string, legalEntityId?: string) =>
    call<(HierarchyNode & { legalEntityId: string })[]>(
      `/api/hierarchy/divisions${legalEntityId ? `?legalEntityId=${encodeURIComponent(legalEntityId)}` : ""}`,
      actor,
    ),
  listHierarchyChanges: (actor: string) => call<HierarchyChange[]>("/api/hierarchy/changes", actor),
  addHierarchyNode: (actor: string, input: AddHierarchyNodeInput) =>
    call<HierarchyNode>("/api/hierarchy", actor, "POST", input),
  renameHierarchyNode: (actor: string, nodeKind: NodeKind, nodeId: string, name: string) =>
    call<HierarchyNode>(
      `/api/hierarchy/${encodeURIComponent(nodeKind)}/${encodeURIComponent(nodeId)}/rename`,
      actor,
      "POST",
      { name },
    ),
  setHierarchyNodeInactive: (actor: string, nodeKind: NodeKind, nodeId: string) =>
    call<HierarchyNode>(
      `/api/hierarchy/${encodeURIComponent(nodeKind)}/${encodeURIComponent(nodeId)}/set-inactive`,
      actor,
      "POST",
      {},
    ),
};
