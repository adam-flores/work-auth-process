import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

/**
 * The tab shell (#91). Deliberately ignorant of what a tab holds - a label
 * and content, nothing else - so the pipeline views, the insights redesign,
 * and the demo player can each land inside a tab without this changing.
 * Not a router (ADR-0001 settles plain React with no router opinion to
 * disturb, and this is a layout change, not a routing concern).
 *
 * Controlled by its caller (#94) rather than holding its own state: the
 * scripted demo player switches tabs itself as the story requires, which
 * only works if something outside this component can set the active tab.
 * `App.tsx` is Tabs' one caller and owns `activeTabId` for exactly this
 * reason.
 *
 * Every tab's content is mounted up front and stays mounted - switching only
 * toggles the native `hidden` attribute. Before this shell, every section
 * was always mounted on the one scrolling page, so this keeps that: in
 * particular `MyQueue.tsx`'s background poll - standing in for CONTEXT.md's
 * "Notification" push - starts on page load and keeps running for a
 * participant who never opens "My Queue" at all, the same as it always has,
 * rather than only for one who happens to have opened that tab first.
 * Mounting everything up front also keeps every tab button's
 * `aria-controls` pointed at a real element from the start.
 *
 * `role="tab"`/`role="tablist"` imply the ARIA tab-pattern's keyboard
 * behavior, so arrow keys move both focus and selection between tabs (Home
 * and End jump to the first and last), with a roving `tabIndex` so the
 * tablist is one stop on the page's own Tab order, not one per button. A
 * click also explicitly focuses the clicked tab, rather than relying on the
 * browser's default click-to-focus - which some platforms (Safari without
 * Full Keyboard Access) don't apply to buttons - so the arrow keys keep
 * working right after a mouse click everywhere.
 */

export type TabDefinition = {
  id: string;
  label: string;
  content: ReactNode;
};

export type TabsProps = {
  tabs: [TabDefinition, ...TabDefinition[]];
  activeTabId: string;
  onActiveTabIdChange: (id: string) => void;
};

export function Tabs({ tabs, activeTabId, onActiveTabIdChange }: TabsProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activateIndex = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    onActiveTabIdChange(tab.id);
    buttonRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      activateIndex((index + 1) % tabs.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateIndex((index - 1 + tabs.length) % tabs.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      activateIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      activateIndex(tabs.length - 1);
    }
  };

  return (
    <div className="tabs">
      <div role="tablist" aria-label="Sections" className="tab-list">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === activeTabId}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={tab.id === activeTabId ? 0 : -1}
            className={tab.id === activeTabId ? "tab active" : "tab"}
            onClick={() => activateIndex(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== activeTabId}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
