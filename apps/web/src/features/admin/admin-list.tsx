import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// Paged admin lists: the page shape the API answers with, a cache helper that edits an item wherever it is cached
// (a whole list or any page of it), and the pager shown under a list.
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export type AdminPage<T, C = Record<string, number>> = { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number; counts?: C };

type Cached<T> = T[] | AdminPage<T, unknown> | undefined;

/** Applies a change to the items of every cached list under a key: plain lists and pages alike. */
export function updateCachedLists<T>(queryClient: QueryClient, key: QueryKey, change: (items: T[]) => T[]): Array<[QueryKey, unknown]> {
  const previous = queryClient.getQueriesData({ queryKey: key });
  queryClient.setQueriesData<Cached<T>>({ queryKey: key }, (current) => {
    if (!current) return current;
    if (Array.isArray(current)) return change(current);
    if (Array.isArray((current as AdminPage<T>).items)) return { ...current, items: change((current as AdminPage<T>).items) };
    return current;
  });
  return previous;
}

export function restoreCachedLists(queryClient: QueryClient, previous: Array<[QueryKey, unknown]> | undefined): void {
  previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

/** A value that follows another after a short pause (typing in a search box does not reload on every key). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

const copy = {
  en: { label: "Pages", previous: "Previous", next: "Next", perPage: "Per page", showing: (from: number, to: number, total: number) => `${from}–${to} of ${total}`, page: (n: number) => `Page ${n}` },
  ar: { label: "الصفحات", previous: "السابق", next: "التالي", perPage: "لكل صفحة", showing: (from: number, to: number, total: number) => `${from}–${to} من ${total}`, page: (n: number) => `الصفحة ${n}` },
};

/** Page numbers around the current one, with gaps: 1 … 4 5 6 … 20. */
export function pageNumbers(current: number, total: number): Array<number | "gap"> {
  const wanted = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export function AdminPager({ page, pageSize, totalItems, totalPages, onPage, onPageSize, isArabic, busy }: {
  page: number; pageSize: number; totalItems: number; totalPages: number; isArabic: boolean; busy?: boolean;
  onPage: (page: number) => void; onPageSize: (size: PageSize) => void;
}) {
  const t = copy[isArabic ? "ar" : "en"];
  if (totalItems === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalItems, page * pageSize);
  return (
    <nav className="admin-pager" aria-label={t.label} aria-busy={busy || undefined}>
      <p className="admin-pager__count" aria-live="polite">{t.showing(from, to, totalItems)}</p>
      {totalPages > 1 ? (
        <ol className="admin-pager__pages">
          <li><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t.previous}</button></li>
          {pageNumbers(page, totalPages).map((entry, index) => entry === "gap"
            ? <li key={`gap-${index}`} aria-hidden="true" className="admin-pager__gap">…</li>
            : <li key={entry}><button type="button" aria-current={entry === page ? "page" : undefined} aria-label={t.page(entry)} onClick={() => onPage(entry)}>{entry}</button></li>)}
          <li><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t.next}</button></li>
        </ol>
      ) : null}
      <label className="admin-pager__size">
        <span>{t.perPage}</span>
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    </nav>
  );
}
