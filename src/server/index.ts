import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createService } from "../service/index.ts";
import type { Service } from "../service/index.ts";
import { DomainError } from "../service/errors.ts";
import type { DomainErrorCode } from "../service/errors.ts";
import type {
  DepartmentQueryInput,
  DraftFieldsInput,
  PermissibilityRuleInput,
  ResourceInput,
  TransitionOptionsInput,
} from "../shared/rules.ts";


/**
 * A thin adapter over the service (ADR-0010). It parses a request, calls one
 * function, serializes what comes back, and maps a domain error to a status.
 * It does not branch on domain state: if a handler here ever needs to know what
 * stage an authorization is at, the thing it needs belongs in the service.
 */

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const PORT = Number(process.env.PORT ?? 3000);

/** The whole of the adapter's error handling: a lookup, not a decision. */
const STATUS_FOR: Record<DomainErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNKNOWN_PARTICIPANT: 403,
  UNKNOWN_DEPARTMENT: 404,
  UNKNOWN_DRAFT: 404,
  UNKNOWN_RESOURCE: 404,
  UNKNOWN_AUTHORIZATION: 404,
  UNKNOWN_PERMISSIBILITY_RULE: 404,
  NOT_DRAFT_OWNER: 403,
  NOT_ADMINISTRATOR: 403,
  NOT_IN_QUEUE: 403,
  NOT_CLAIMANT: 403,
  NOT_CORRECTOR: 403,
  NOT_AWAITING_CORRECTION: 409,
  FIELD_NOT_CORRECTABLE: 409,
  DRAFT_INCOMPLETE: 409,
  IMPERMISSIBLE_PAIRING: 409,
  NOT_SUBMITTER: 403,
  ALREADY_ON_HOLD: 409,
  NOT_ON_HOLD: 409,
  AUTHORIZATION_ON_HOLD: 409,
  AUTHORIZATION_TERMINAL: 409,
};

/**
 * Every call names who is acting; nothing here reads a session (ADR-0010).
 *
 * A missing header is refused rather than defaulted. Defaulting to `system`
 * would mean a request that names nobody gets the one identity that skips the
 * roster check - and since a request with no custom header needs no preflight,
 * any page on the internet could have posted it.
 */
function actingParticipant(req: IncomingMessage): { participantId: string } {
  const header = req.headers["x-acting-participant"];
  const id = Array.isArray(header) ? header[0] : header;
  if (!id) {
    throw new DomainError(
      "INVALID_REQUEST",
      "An acting participant is required (the x-acting-participant header).",
    );
  }
  return { participantId: id };
}

type Handler = (
  service: Service,
  ctx: { participantId: string },
  query: URLSearchParams,
  body: unknown,
) => unknown;

/** The body of a POST or PATCH, parsed once per request. A route with
 *  nothing to read from it (every GET, DELETE, and `POST /api/store/reset`)
 *  simply never looks at the result. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError("INVALID_REQUEST", "The request body must be valid JSON.");
  }
}

/**
 * An attribute filter travels as a repeated `attr` param, `name:value` each -
 * the query string has no native way to carry a list of pairs. BDR-0008 keeps
 * attribute names out of code, so this parses whatever the picker sent rather
 * than a fixed set.
 */
function parseDepartmentQuery(query: URLSearchParams): DepartmentQueryInput {
  // A malformed `attr` (no `:value`) is dropped rather than turned into an
  // empty-value filter, which AttributeFilter's schema refuses outright and
  // would otherwise fail the whole query over one bad param.
  const attributes = query
    .getAll("attr")
    .map((raw) => {
      const sep = raw.indexOf(":");
      return sep === -1 ? null : { name: raw.slice(0, sep), value: raw.slice(sep + 1) };
    })
    .filter((attr) => attr !== null);
  return {
    text: query.get("text") ?? undefined,
    attributes,
    legalEntityId: query.get("legalEntityId") ?? undefined,
    divisionId: query.get("divisionId") ?? undefined,
    includeInactive: query.get("includeInactive") === "true",
  };
}

const ROUTES: Record<string, Handler> = {
  "GET /api/participants": (s, ctx) => s.listParticipants(ctx),
  "GET /api/store": (s, ctx) => s.getStoreInfo(ctx),
  "POST /api/store/reset": (s, ctx) => s.resetStore(ctx),
  "GET /api/departments": (s, ctx, query) => s.searchDepartments(ctx, parseDepartmentQuery(query)),
  "POST /api/drafts": (s, ctx, _query, body) => s.createDraft(ctx, body as DraftFieldsInput),
  "GET /api/drafts": (s, ctx) => s.listMyDrafts(ctx),
  "GET /api/queue": (s, ctx) => s.listMyQueue(ctx),
  "GET /api/dashboard": (s, ctx) => s.listDashboard(ctx),
  "GET /api/permissibility-rules": (s, ctx) => s.listPermissibilityRules(ctx),
  "POST /api/permissibility-rules": (s, ctx, _query, body) =>
    s.addPermissibilityRule(ctx, body as PermissibilityRuleInput),
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function serveStatic(url: string, res: ServerResponse): Promise<void> {
  // Resolve inside the web root and refuse anything that escapes it.
  const requested = normalize(url.split("?")[0] ?? "/");
  const candidate = resolve(join(webRoot, requested));
  const inRoot = candidate === webRoot || candidate.startsWith(webRoot + sep);
  const target = inRoot && extname(candidate) ? candidate : join(webRoot, "index.html");

  try {
    const file = await readFile(target);
    res.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found. Run `npm run build` first, or use `npm run dev` for the dev server.");
  }
}

const DEPARTMENT_PATH = /^\/api\/departments\/([^/]+)$/;
const DRAFT_PATH = /^\/api\/drafts\/([^/]+)$/;
const DRAFT_RESOURCES_PATH = /^\/api\/drafts\/([^/]+)\/resources$/;
const DRAFT_RESOURCE_PATH = /^\/api\/drafts\/([^/]+)\/resources\/([^/]+)$/;
const DRAFT_INITIATE_PATH = /^\/api\/drafts\/([^/]+)\/initiate$/;
const AUTHORIZATION_PATH = /^\/api\/authorizations\/([^/]+)$/;
const AUTHORIZATION_ACKNOWLEDGE_PATH = /^\/api\/authorizations\/([^/]+)\/acknowledge$/;
const AUTHORIZATION_CLAIM_PATH = /^\/api\/authorizations\/([^/]+)\/claim$/;
const AUTHORIZATION_CONTRIBUTE_PATH = /^\/api\/authorizations\/([^/]+)\/contribute$/;
const AUTHORIZATION_MINT_PATH = /^\/api\/authorizations\/([^/]+)\/mint$/;
const AUTHORIZATION_CLASSIFICATION_PATH = /^\/api\/authorizations\/([^/]+)\/classification$/;
const AUTHORIZATION_REQUEST_CORRECTION_PATH = /^\/api\/authorizations\/([^/]+)\/request-correction$/;
const AUTHORIZATION_CORRECT_PATH = /^\/api\/authorizations\/([^/]+)\/correct$/;
const PERMISSIBILITY_RULE_PATH = /^\/api\/permissibility-rules\/([^/]+)$/;

export function createHttpServer(service: Service) {
  return createServer(async (req, res) => {
    const url = req.url ?? "/";
    const [pathname = "/", queryString] = url.split("?");
    const query = new URLSearchParams(queryString ?? "");
    const method = req.method ?? "GET";

    try {
      // The one dynamic path in the surface: a department id, not a second
      // routing scheme. Everything else stays the flat exact-match table.
      const departmentMatch = method === "GET" ? DEPARTMENT_PATH.exec(pathname) : null;
      if (departmentMatch?.[1]) {
        const ctx = actingParticipant(req);
        return sendJson(res, 200, service.getDepartment(ctx, decodeURIComponent(departmentMatch[1])));
      }

      // An authorization's id - the record initiation discharges a draft
      // into (#54), read back the same way a department or a draft is.
      const authorizationMatch = method === "GET" ? AUTHORIZATION_PATH.exec(pathname) : null;
      if (authorizationMatch?.[1]) {
        const ctx = actingParticipant(req);
        return sendJson(
          res,
          200,
          service.getAuthorization(ctx, decodeURIComponent(authorizationMatch[1])),
        );
      }

      const acknowledgeMatch = method === "POST" ? AUTHORIZATION_ACKNOWLEDGE_PATH.exec(pathname) : null;
      if (acknowledgeMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(
          res,
          200,
          service.acknowledge(ctx, decodeURIComponent(acknowledgeMatch[1]), body as TransitionOptionsInput),
        );
      }

      const claimMatch = method === "POST" ? AUTHORIZATION_CLAIM_PATH.exec(pathname) : null;
      if (claimMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(
          res,
          200,
          service.claim(ctx, decodeURIComponent(claimMatch[1]), body as TransitionOptionsInput),
        );
      }

      const contributeMatch = method === "POST" ? AUTHORIZATION_CONTRIBUTE_PATH.exec(pathname) : null;
      if (contributeMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(res, 200, service.contribute(ctx, decodeURIComponent(contributeMatch[1]), body));
      }

      const mintMatch = method === "POST" ? AUTHORIZATION_MINT_PATH.exec(pathname) : null;
      if (mintMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(res, 200, service.mintChargeNumber(ctx, decodeURIComponent(mintMatch[1]), body));
      }

      const classificationMatch = method === "GET" ? AUTHORIZATION_CLASSIFICATION_PATH.exec(pathname) : null;
      if (classificationMatch?.[1]) {
        const ctx = actingParticipant(req);
        return sendJson(
          res,
          200,
          service.getClassification(ctx, decodeURIComponent(classificationMatch[1])),
        );
      }

      const requestCorrectionMatch = method === "POST" ? AUTHORIZATION_REQUEST_CORRECTION_PATH.exec(pathname) : null;
      if (requestCorrectionMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(
          res,
          200,
          service.requestCorrection(ctx, decodeURIComponent(requestCorrectionMatch[1]), body),
        );
      }

      const correctMatch = method === "POST" ? AUTHORIZATION_CORRECT_PATH.exec(pathname) : null;
      if (correctMatch?.[1]) {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(res, 200, service.correct(ctx, decodeURIComponent(correctMatch[1]), body));
      }

      // A draft's id, and a resource's id nested under it - the same
      // dynamic-path treatment as a department id above, not a second
      // routing scheme. Order does not matter between these three: each
      // pattern is fully anchored and matches a different path shape.
      const resourceMatch = DRAFT_RESOURCE_PATH.exec(pathname);
      if (resourceMatch?.[1] && resourceMatch[2] && method === "DELETE") {
        const ctx = actingParticipant(req);
        return sendJson(
          res,
          200,
          service.removeResource(
            ctx,
            decodeURIComponent(resourceMatch[1]),
            decodeURIComponent(resourceMatch[2]),
          ),
        );
      }

      const resourcesMatch = DRAFT_RESOURCES_PATH.exec(pathname);
      if (resourcesMatch?.[1] && method === "POST") {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        // 200, not 201: nothing else in this adapter distinguishes creation
        // by status code (POST /api/drafts included), and every response
        // body already carries the created or updated record back.
        return sendJson(
          res,
          200,
          service.addResource(ctx, decodeURIComponent(resourcesMatch[1]), body as ResourceInput),
        );
      }

      const initiateMatch = DRAFT_INITIATE_PATH.exec(pathname);
      if (initiateMatch?.[1] && method === "POST") {
        const ctx = actingParticipant(req);
        const body = await readJsonBody(req);
        return sendJson(
          res,
          200,
          service.initiateDraft(ctx, decodeURIComponent(initiateMatch[1]), body as TransitionOptionsInput),
        );
      }

      const permissibilityRuleMatch = method === "DELETE" ? PERMISSIBILITY_RULE_PATH.exec(pathname) : null;
      if (permissibilityRuleMatch?.[1]) {
        const ctx = actingParticipant(req);
        return sendJson(
          res,
          200,
          service.removePermissibilityRule(ctx, decodeURIComponent(permissibilityRuleMatch[1])),
        );
      }

      const draftMatch = DRAFT_PATH.exec(pathname);
      if (draftMatch?.[1] && (method === "GET" || method === "PATCH" || method === "DELETE")) {
        const ctx = actingParticipant(req);
        const draftId = decodeURIComponent(draftMatch[1]);
        if (method === "GET") return sendJson(res, 200, service.getDraft(ctx, draftId));
        if (method === "DELETE") return sendJson(res, 200, service.deleteDraft(ctx, draftId));
        const body = await readJsonBody(req);
        return sendJson(res, 200, service.updateDraft(ctx, draftId, body as DraftFieldsInput));
      }

      const route = ROUTES[`${method} ${pathname}`];
      if (!route) {
        if (pathname.startsWith("/api/")) return sendJson(res, 404, { error: "No such endpoint." });
        return serveStatic(url, res);
      }

      const body = method === "POST" || method === "PATCH" ? await readJsonBody(req) : undefined;
      sendJson(res, 200, route(service, actingParticipant(req), query, body));
    } catch (err) {
      if (err instanceof DomainError) {
        return sendJson(res, STATUS_FOR[err.code], { code: err.code, error: err.message });
      }
      console.error(err);
      sendJson(res, 500, { error: "Unexpected error." });
    }
  });
}

// Started directly rather than imported: one process serves the API and the
// built web app from a single URL.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const service = createService();
  createHttpServer(service).listen(PORT, () => {
    console.log(`work authorization prototype -> http://localhost:${PORT}`);
  });
}
