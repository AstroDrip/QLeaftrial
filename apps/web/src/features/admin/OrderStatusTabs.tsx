import { useRef, type KeyboardEvent } from "react";

export type StatusTab<T extends string> = { value: T; label: string; count: number; tone: "pending" | "accepted" | "declined" | "completed" };

// On phones the active tab takes the flexible column and the others shrink to
// 44px letter buttons; the grid tracks animate when the selection moves.
export function statusTabColumns(count: number, activeIndex: number): string {
  return Array.from({ length: count }, (_, index) => (index === activeIndex ? "minmax(0, 1fr)" : "44px")).join(" ");
}

export function OrderStatusTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  panelId,
}: {
  tabs: Array<StatusTab<T>>;
  active: T;
  onChange: (value: T) => void;
  label: string;
  panelId: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === active));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Left/right follow reading direction, so they swap in Arabic.
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const steps: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 };
    let next = activeIndex;
    if (event.key in steps) next = (activeIndex + steps[event.key] + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      className="status-tabs"
      role="tablist"
      aria-label={label}
      style={{ ["--status-columns" as string]: statusTabColumns(tabs.length, activeIndex) }}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={tab.value}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={panelId}
            aria-label={`${tab.label} (${tab.count})`}
            tabIndex={selected ? 0 : -1}
            className={`status-tab status-tab--${tab.tone}`}
            onClick={() => onChange(tab.value)}
          >
            <span className="status-tab__letter" aria-hidden="true">{tab.label.charAt(0)}</span>
            <span className="status-tab__label" aria-hidden="true">{tab.label}</span>
            <span className="status-tab__count" aria-hidden="true">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
