import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api.ts";
import type { ResolvedDepartment } from "./api.ts";
import type { AttributeFilter } from "../shared/rules.ts";

/**
 * One surface, used for both sides (BDR-0008): narrow on any attributes in any
 * combination, then search what remains by name. Resolves to a department -
 * the division and legal entity above it are derived and shown, never asked
 * for. There is no free-text entry for the department itself: the only way to
 * select one is to click a result this component fetched from the service, so
 * a department absent from the hierarchy can never be named.
 */

type AttributeGroup = { name: string; values: string[] };

const filterKey = (f: AttributeFilter) => `${f.name}\u0000${f.value}`;

function attributeGroups(catalog: ResolvedDepartment[]): AttributeGroup[] {
  const byName = new Map<string, Set<string>>();
  for (const department of catalog) {
    for (const attribute of department.attributes) {
      const values = byName.get(attribute.name) ?? new Set<string>();
      values.add(attribute.value);
      byName.set(attribute.name, values);
    }
  }
  return [...byName.entries()]
    .map(([name, values]) => ({ name, values: [...values].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type DepartmentPickerProps = {
  /** Prefixes every test id and input id this instance renders, so two
   *  pickers on one page (requesting side, performing side) stay addressable. */
  testId: string;
  label: string;
  actingId: string;
  selected: ResolvedDepartment | null;
  onSelect: (department: ResolvedDepartment | null) => void;
};

export function DepartmentPicker({ testId, label, actingId, selected, onSelect }: DepartmentPickerProps) {
  const [catalog, setCatalog] = useState<ResolvedDepartment[] | null>(null);
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [activeFilters, setActiveFilters] = useState<AttributeFilter[]>([]);
  const [results, setResults] = useState<ResolvedDepartment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "latest wins" (as in App.tsx): a slow response from a query the person has
  // since changed must not overwrite the result of the one they are looking at.
  const latestCatalog = useRef(0);
  const latestResults = useRef(0);

  useEffect(() => {
    const seq = ++latestCatalog.current;
    setCatalog(null);
    api
      .searchDepartments(actingId)
      .then((departments) => {
        if (seq === latestCatalog.current) setCatalog(departments);
      })
      .catch((err: unknown) => {
        if (seq === latestCatalog.current) {
          setError(err instanceof ApiError ? err.message : String(err));
        }
      });
  }, [actingId]);

  // Debounced: a person typing a name fires one search per pause, not one per
  // keystroke. Filters (checkboxes) skip this - each click is already discrete.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), 200);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (selected) return; // Nothing to narrow once a department is chosen.
    const seq = ++latestResults.current;
    setError(null);
    api
      .searchDepartments(actingId, { text: debouncedText, attributes: activeFilters })
      .then((departments) => {
        if (seq === latestResults.current) setResults(departments);
      })
      .catch((err: unknown) => {
        if (seq === latestResults.current) {
          setResults(null);
          setError(err instanceof ApiError ? err.message : String(err));
        }
      });
  }, [actingId, debouncedText, activeFilters, selected]);

  const groups = useMemo(() => attributeGroups(catalog ?? []), [catalog]);
  const activeKeys = useMemo(() => new Set(activeFilters.map(filterKey)), [activeFilters]);

  const toggleFilter = useCallback((name: string, value: string) => {
    setActiveFilters((prev) => {
      const key = filterKey({ name, value });
      const without = prev.filter((f) => filterKey(f) !== key);
      return without.length === prev.length ? [...prev, { name, value }] : without;
    });
  }, []);

  const select = (department: ResolvedDepartment) => {
    onSelect(department);
    setError(null);
  };

  const change = () => {
    onSelect(null);
    setText("");
    setDebouncedText("");
    setActiveFilters([]);
  };

  return (
    <div className="department-picker" data-testid={testId}>
      <h3>{label}</h3>

      {selected ? (
        <div data-testid={`${testId}-selected`}>
          <dl>
            <dt>Department</dt>
            <dd>{selected.name}</dd>
            <dt>Division</dt>
            <dd>{selected.division.name}</dd>
            <dt>Legal entity</dt>
            <dd>{selected.legalEntity.name}</dd>
          </dl>
          <button type="button" onClick={change} data-testid={`${testId}-change`}>
            Change
          </button>
        </div>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="attribute-filters">
              {groups.map((group) => (
                <fieldset key={group.name}>
                  <legend>{group.name}</legend>
                  {group.values.map((value) => (
                    <label key={value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={activeKeys.has(filterKey({ name: group.name, value }))}
                        onChange={() => toggleFilter(group.name, value)}
                      />
                      {value}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}

          <label htmlFor={`${testId}-search`}>Search by name</label>
          <input
            id={`${testId}-search`}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Department name"
          />

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          <ul className="department-results" data-testid={`${testId}-results`}>
            {results === null ? (
              <li className="hint">Loading…</li>
            ) : results.length === 0 ? (
              <li className="hint">No matching departments.</li>
            ) : (
              results.map((department) => (
                <li key={department.id}>
                  <button type="button" onClick={() => select(department)}>
                    {department.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
