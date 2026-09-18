import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { HierarchyChange, HierarchyNode, ResolvedDepartment } from "./api.ts";
import { NODE_KIND_LABELS, NODE_KIND_VALUES } from "../shared/constants.ts";
import type { NodeKind } from "../shared/constants.ts";

/**
 * The Administrator's surface over the organizational hierarchy (#64,
 * BDR-0010, ADR-0011): add, rename and set a legal entity, a division or a
 * department inactive - never a delete, and re-parenting is specified but
 * deliberately not built. Setting a node inactive is irreversible here (no
 * command reverses it, the same way none is built to), so it carries no
 * confirmation dialog beyond what its own label already says, the same
 * restraint `PermissibilityRules.tsx`'s "Remove" already shows.
 *
 * Reading the tree stays open to everyone, the same as every other
 * reference-data read; only the mutating actions and the change log are
 * gated to an Administrator.
 */

type Division = HierarchyNode & { legalEntityId: string };

function describeChange(change: HierarchyChange): string {
  const label = NODE_KIND_LABELS[change.nodeKind].toLowerCase();
  if (change.kind === "add") return `Added ${label} "${change.name}".`;
  if (change.kind === "rename") return `Renamed ${label} "${change.from}" to "${change.to}".`;
  return `Closed ${label} "${change.name}".`;
}

type NodeRowProps = {
  nodeKind: NodeKind;
  node: HierarchyNode;
  isAdministrator: boolean;
  busy: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onClose: () => void;
};

function HierarchyNodeRow({
  node,
  isAdministrator,
  busy,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onClose,
}: NodeRowProps) {
  if (isRenaming) {
    return (
      <span data-testid="hierarchy-rename-form">
        Renaming <strong>{node.name}</strong>:{" "}
        <input
          aria-label={`New name for ${node.name}`}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          data-testid="hierarchy-rename-input"
        />
        <button type="button" onClick={onSaveRename} disabled={busy || !renameValue.trim()} data-testid="hierarchy-rename-save">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancelRename} disabled={busy}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span>
      <strong>{node.name}</strong>
      {!node.active && <span className="hint"> (inactive)</span>}
      {isAdministrator && (
        <>
          <button type="button" onClick={onStartRename} disabled={busy} data-testid="hierarchy-rename">
            Rename
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || !node.active}
            data-testid="hierarchy-set-inactive"
          >
            Set inactive
          </button>
        </>
      )}
    </span>
  );
}

export type HierarchyAdminProps = { actingId: string; isAdministrator: boolean };

export function HierarchyAdmin({ actingId, isAdministrator }: HierarchyAdminProps) {
  const [legalEntities, setLegalEntities] = useState<HierarchyNode[] | null>(null);
  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [departments, setDepartments] = useState<ResolvedDepartment[] | null>(null);
  const [changes, setChanges] = useState<HierarchyChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addKind, setAddKind] = useState<NodeKind>("department");
  const [addName, setAddName] = useState("");
  const [addLegalEntityId, setAddLegalEntityId] = useState("");
  const [addDivisionId, setAddDivisionId] = useState("");

  const [renaming, setRenaming] = useState<{ nodeKind: NodeKind; nodeId: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async (actor: string) => {
    try {
      const [entities, divs, deps] = await Promise.all([
        api.listLegalEntities(actor),
        api.listDivisions(actor),
        api.searchDepartments(actor, { includeInactive: true }),
      ]);
      setLegalEntities(entities);
      setDivisions(divs);
      setDepartments(deps);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  // Restricted to the Administrator (BDR-0010: "visible to the
  // Administrator"), so a non-Administrator simply never has one to show
  // rather than seeing a refusal for a list they cannot see anyway.
  const loadChanges = useCallback(async (actor: string) => {
    try {
      setChanges(await api.listHierarchyChanges(actor));
    } catch {
      setChanges(null);
    }
  }, []);

  useEffect(() => {
    void load(actingId);
  }, [load, actingId]);

  useEffect(() => {
    if (isAdministrator) void loadChanges(actingId);
    else setChanges(null);
  }, [loadChanges, actingId, isAdministrator]);

  const addNode = async () => {
    setBusy(true);
    setError(null);
    try {
      if (addKind === "legal-entity") {
        await api.addHierarchyNode(actingId, { nodeKind: "legal-entity", name: addName });
      } else if (addKind === "division") {
        await api.addHierarchyNode(actingId, {
          nodeKind: "division",
          name: addName,
          legalEntityId: addLegalEntityId,
        });
      } else {
        await api.addHierarchyNode(actingId, {
          nodeKind: "department",
          name: addName,
          divisionId: addDivisionId,
        });
      }
      setAddName("");
      await Promise.all([load(actingId), loadChanges(actingId)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startRename = (nodeKind: NodeKind, node: HierarchyNode) => {
    setError(null);
    setRenaming({ nodeKind, nodeId: node.id });
    setRenameValue(node.name);
  };

  const saveRename = async () => {
    if (!renaming) return;
    setBusy(true);
    setError(null);
    try {
      await api.renameHierarchyNode(actingId, renaming.nodeKind, renaming.nodeId, renameValue);
      setRenaming(null);
      await Promise.all([load(actingId), loadChanges(actingId)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const closeNode = async (nodeKind: NodeKind, nodeId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.setHierarchyNodeInactive(actingId, nodeKind, nodeId);
      await Promise.all([load(actingId), loadChanges(actingId)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const rowProps = (nodeKind: NodeKind, node: HierarchyNode): NodeRowProps => ({
    nodeKind,
    node,
    isAdministrator,
    busy,
    isRenaming: renaming?.nodeKind === nodeKind && renaming.nodeId === node.id,
    renameValue,
    onRenameValueChange: setRenameValue,
    onStartRename: () => startRename(nodeKind, node),
    onCancelRename: () => setRenaming(null),
    onSaveRename: () => void saveRename(),
    onClose: () => void closeNode(nodeKind, node.id),
  });

  const loading = legalEntities === null || divisions === null || departments === null;

  return (
    <section aria-labelledby="hierarchy-admin-heading" data-testid="hierarchy-admin">
      <h2 id="hierarchy-admin-heading">Organizational hierarchy</h2>
      <p className="hint">
        Legal entities, divisions and departments - added, renamed and closed here by an
        Administrator (BDR-0010). Nothing is ever deleted: closing a node here closes every
        department beneath it too, and revokes every in-flight authorization that names one.
        Re-parenting is specified and deliberately not built.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <ul className="hierarchy-tree" data-testid="hierarchy-tree">
        {loading ? (
          <li className="hint">Loading…</li>
        ) : (
          legalEntities.map((entity) => (
            <li key={entity.id} data-testid="hierarchy-legal-entity-row">
              <HierarchyNodeRow {...rowProps("legal-entity", entity)} />
              <ul>
                {divisions
                  .filter((division) => division.legalEntityId === entity.id)
                  .map((division) => (
                    <li key={division.id} data-testid="hierarchy-division-row">
                      <HierarchyNodeRow {...rowProps("division", division)} />
                      <ul>
                        {departments
                          .filter((department) => department.division.id === division.id)
                          .map((department) => (
                            <li key={department.id} data-testid="hierarchy-department-row">
                              <HierarchyNodeRow {...rowProps("department", department)} />
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            </li>
          ))
        )}
      </ul>

      {isAdministrator ? (
        <div className="hierarchy-add-form" data-testid="hierarchy-add-form">
          <h3>Add</h3>
          <label htmlFor="hierarchy-add-kind">Level</label>
          <select
            id="hierarchy-add-kind"
            value={addKind}
            onChange={(e) => setAddKind(e.target.value as NodeKind)}
          >
            {NODE_KIND_VALUES.map((kind) => (
              <option key={kind} value={kind}>
                {NODE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>

          {addKind === "division" && (
            <>
              <label htmlFor="hierarchy-add-legal-entity">Legal entity</label>
              <select
                id="hierarchy-add-legal-entity"
                value={addLegalEntityId}
                onChange={(e) => setAddLegalEntityId(e.target.value)}
              >
                <option value="">Choose one…</option>
                {(legalEntities ?? []).map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {addKind === "department" && (
            <>
              <label htmlFor="hierarchy-add-division">Division</label>
              <select
                id="hierarchy-add-division"
                value={addDivisionId}
                onChange={(e) => setAddDivisionId(e.target.value)}
              >
                <option value="">Choose one…</option>
                {(divisions ?? []).map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="hierarchy-add-name">Name</label>
          <input
            id="hierarchy-add-name"
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />

          <button
            type="button"
            onClick={() => void addNode()}
            disabled={
              busy ||
              !addName.trim() ||
              (addKind === "division" && !addLegalEntityId) ||
              (addKind === "department" && !addDivisionId)
            }
            data-testid="add-hierarchy-node"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      ) : (
        <p className="hint">Act as an Administrator to add, rename or close part of the hierarchy.</p>
      )}

      {isAdministrator && (
        <div data-testid="hierarchy-change-log">
          <h3>Hierarchy change log</h3>
          <ul>
            {changes === null ? (
              <li className="hint">Loading…</li>
            ) : changes.length === 0 ? (
              <li className="hint">No changes yet.</li>
            ) : (
              changes.map((change) => (
                <li key={change.id} data-testid="hierarchy-change-row">
                  {describeChange(change)} — {new Date(change.occurredAt).toLocaleString()}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
