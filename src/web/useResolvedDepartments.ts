import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { ResolvedDepartment } from "./api.ts";

/** An authorization's requesting and performing department, resolved to
 *  names for display - an authorization carries only their ids. Shared by
 *  `MyQueue.tsx`'s open-item detail and `MasterDashboard.tsx`'s history
 *  view, the two places a department name is shown rather than just its
 *  id. */
export function useResolvedDepartments(
  actingId: string,
  authorization: { id: string; requestingDepartmentId: string; performingDepartmentId: string },
): { requesting: ResolvedDepartment | null; performing: ResolvedDepartment | null } {
  const [requesting, setRequesting] = useState<ResolvedDepartment | null>(null);
  const [performing, setPerforming] = useState<ResolvedDepartment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRequesting(null);
    setPerforming(null);
    void api.getDepartment(actingId, authorization.requestingDepartmentId).then((d) => {
      if (!cancelled) setRequesting(d);
    });
    void api.getDepartment(actingId, authorization.performingDepartmentId).then((d) => {
      if (!cancelled) setPerforming(d);
    });
    return () => {
      cancelled = true;
    };
  }, [actingId, authorization.id, authorization.requestingDepartmentId, authorization.performingDepartmentId]);

  return { requesting, performing };
}
