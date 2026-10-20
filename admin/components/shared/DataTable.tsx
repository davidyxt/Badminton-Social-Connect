"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  className?: string;
}

export interface FilterDef<T> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  getValue: (row: T) => string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Free-text search over whatever text this returns. */
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: FilterDef<T>[];
  /** Initial values for filters, by filter id. */
  initialFilters?: Record<string, string>;
  initialSort?: { columnId: string; direction: "asc" | "desc" };
  pageSize?: number;
  rowHref?: (row: T) => string;
  /** Accessible name for a linked row, e.g. "Open report from Sam Lee". Without it the row is named from its cells. */
  rowLabel?: (row: T) => string;
  /** Shown when there are no rows after filtering. */
  empty: ReactNode;
  /** Extra controls in the toolbar; receives the filtered (pre-pagination) rows, e.g. for CSV export. */
  toolbarExtra?: (filteredRows: T[]) => ReactNode;
  caption?: string;
}

/** Sortable, filterable, paginated table shared by every list screen. */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  getSearchText,
  searchPlaceholder = "Search",
  filters = [],
  initialFilters = {},
  initialSort,
  pageSize = 10,
  rowHref,
  rowLabel,
  empty,
  toolbarExtra,
  caption,
}: DataTableProps<T>) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters);
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((row) => {
      if (q && getSearchText && !getSearchText(row).toLowerCase().includes(q)) return false;
      return filters.every((f) => {
        const v = filterValues[f.id];
        return !v || f.getValue(row) === v;
      });
    });
    if (sort) {
      const col = columns.find((c) => c.id === sort.columnId);
      if (col?.sortValue) {
        const get = col.sortValue;
        out = [...out].sort((a, b) => {
          const av = get(a);
          const bv = get(b);
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sort.direction === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, filterValues, filters, sort, columns, getSearchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (columnId: string) => {
    setSort((s) => (s?.columnId === columnId ? { columnId, direction: s.direction === "asc" ? "desc" : "asc" } : { columnId, direction: "asc" }));
  };

  const hasToolbar = getSearchText || filters.length > 0 || toolbarExtra;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          {getSearchText && (
            <label className="relative min-w-[200px] flex-1 sm:max-w-64">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-line-strong bg-surface pr-2.5 pl-8 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint/60 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              />
            </label>
          )}
          {filters.map((f) => (
            <label key={f.id} className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <span>{f.label}</span>
              <select
                value={filterValues[f.id] ?? ""}
                onChange={(e) => {
                  setFilterValues((v) => ({ ...v, [f.id]: e.target.value }));
                  setPage(0);
                }}
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink transition-colors hover:border-ink-faint/60 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra(filtered)}</div>}
        </div>
      )}

      {filtered.length === 0 ? (
        empty
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="border-b border-line bg-subtle text-xs font-medium text-ink-muted">
              <tr>
                {columns.map((col) => {
                  const active = sort?.columnId === col.id;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                      className={`px-4 py-2 font-medium whitespace-nowrap ${col.align === "right" ? "text-right" : ""} ${col.className ?? ""}`}
                    >
                      {col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.id)}
                          className={`group/sort inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
                        >
                          {col.header}
                          {active ? (
                            sort.direction === "asc" ? (
                              <ChevronUp className="size-3" aria-hidden />
                            ) : (
                              <ChevronDown className="size-3" aria-hidden />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={getRowId(row)}
                    tabIndex={href ? 0 : undefined}
                    aria-label={href ? rowLabel?.(row) : undefined}
                    onClick={
                      href
                        ? (e) => {
                            // Let real links/buttons inside the row handle their own clicks.
                            if ((e.target as HTMLElement).closest("a,button,input,select")) return;
                            // Don't navigate when the admin was selecting text to copy.
                            if (window.getSelection()?.toString()) return;
                            router.push(href);
                          }
                        : undefined
                    }
                    onKeyDown={
                      href
                        ? (e) => {
                            // Only when the row itself has focus, not a link or button inside it.
                            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                            e.preventDefault();
                            router.push(href);
                          }
                        : undefined
                    }
                    className={
                      href
                        ? "cursor-pointer transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                        : ""
                    }
                  >
                    {columns.map((col) => (
                      <td key={col.id} className={`px-4 py-2.5 align-middle ${col.align === "right" ? "text-right tabular-nums" : ""} ${col.className ?? ""}`}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[13px] text-ink-muted">
          <span className="tabular-nums">
            {safePage * pageSize + 1}–{Math.min(filtered.length, (safePage + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="px-1.5 tabular-nums">
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
