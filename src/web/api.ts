import type { Participant } from "../shared/rules.ts";

/** What the service returns about the store it is reading. */
export type StoreInfo = {
  schemaVersion: number;
  seededAt: string;
  participantCount: number;
  departmentCount: number;
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

export const api = {
  listParticipants: (actor: string) => call<Participant[]>("/api/participants", actor),
  getStoreInfo: (actor: string) => call<StoreInfo>("/api/store", actor),
  resetStore: (actor: string) => call<StoreInfo>("/api/store/reset", actor, "POST"),
};
