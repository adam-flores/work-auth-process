import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createService } from "../service/index.ts";
import type { Service } from "../service/index.ts";
import { DomainError } from "../service/errors.ts";
import type { DomainErrorCode } from "../service/errors.ts";
import { SYSTEM_PARTICIPANT_ID } from "../shared/rules.ts";

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
};

/** Every call names who is acting; nothing here reads a session (ADR-0010). */
function actingParticipant(req: IncomingMessage): { participantId: string } {
  const header = req.headers["x-acting-participant"];
  const id = Array.isArray(header) ? header[0] : header;
  return { participantId: id ?? SYSTEM_PARTICIPANT_ID };
}

type Handler = (service: Service, ctx: { participantId: string }) => unknown;

const ROUTES: Record<string, Handler> = {
  "GET /api/participants": (s, ctx) => s.listParticipants(ctx),
  "GET /api/store": (s, ctx) => s.getStoreInfo(ctx),
  "POST /api/store/reset": (s, ctx) => s.resetStore(ctx),
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

export function createHttpServer(service: Service) {
  return createServer(async (req, res) => {
    const url = req.url ?? "/";
    const route = ROUTES[`${req.method ?? "GET"} ${url.split("?")[0]}`];

    if (!route) {
      if (url.startsWith("/api/")) return sendJson(res, 404, { error: "No such endpoint." });
      return serveStatic(url, res);
    }

    try {
      sendJson(res, 200, route(service, actingParticipant(req)));
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
