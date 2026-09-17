import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";

/**
 * What a submitter is told about their own authorizations, past the point
 * they left the relay (#64, BDR-0010, CONTEXT.md: "Notification" - "in one
 * case, when one leaves without them: a submitter is told when a hierarchy
 * change revokes their authorization, which lands it in nobody's queue").
 *
 * The prototype has no session or socket to push over (docs/business-case.md
 * rules authentication out of scope), so this polls the same way
 * `MyQueue.tsx`'s own arrival notifications do, and shows a banner only for a
 * revocation newly seen since the last look - never a persistent list, since
 * the master dashboard is already where someone goes to look a revoked
 * authorization up.
 */

const REVOCATION_POLL_MS = 3000;

type RevocationNotice = { key: string; authorizationId: string; project: string; comment: string };

export type RevocationNoticesProps = { actingId: string };

export function RevocationNotices({ actingId }: RevocationNoticesProps) {
  const [notices, setNotices] = useState<RevocationNotice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef(0);
  // `null` until the first successful poll for the participant currently
  // acting, the same discipline `MyQueue.tsx` follows: a freshly chosen
  // identity's existing revocations must not be read as a batch of new ones.
  const seenIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (actor: string) => {
    const seq = ++latest.current;
    try {
      const mine = await api.listMyRevocations(actor);
      if (seq !== latest.current) return;
      const currentIds = new Set(mine.map((a) => a.id));
      if (seenIds.current !== null) {
        const newlyRevoked = mine.filter((a) => !seenIds.current!.has(a.id));
        if (newlyRevoked.length > 0) {
          setNotices((prev) => [
            ...prev,
            ...newlyRevoked.map((a) => ({
              key: crypto.randomUUID(),
              authorizationId: a.id,
              project: a.project,
              comment: a.revocationComment ?? "",
            })),
          ]);
        }
      }
      seenIds.current = currentIds;
      setError(null);
    } catch (err) {
      if (seq === latest.current) setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setNotices([]);
    seenIds.current = null;
    void load(actingId);
  }, [load, actingId]);

  useEffect(() => {
    const interval = setInterval(() => void load(actingId), REVOCATION_POLL_MS);
    return () => clearInterval(interval);
  }, [load, actingId]);

  const dismiss = (key: string) => setNotices((prev) => prev.filter((n) => n.key !== key));

  if (error) {
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  }
  if (notices.length === 0) return null;

  return (
    <ul className="notification-list" data-testid="revocation-notice-list" aria-label="Revocation notices">
      {notices.map((notice) => (
        <li key={notice.key} role="status" data-testid="revocation-notice">
          <span>
            &ldquo;{notice.project}&rdquo; was revoked: {notice.comment}
          </span>
          <button type="button" onClick={() => dismiss(notice.key)}>
            Dismiss
          </button>
        </li>
      ))}
    </ul>
  );
}
