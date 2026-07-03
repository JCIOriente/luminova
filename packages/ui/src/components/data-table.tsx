import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { cardSurfaceClasses } from "./card";
import { Icon } from "./icons";
import { Input } from "./input";
import { Select } from "./select";
import { IconButton } from "./icon-button";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";
import { pageWindow } from "../lib/page-window";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  sortable?: boolean;
}

export interface FilterChip {
  id: string;
  label: string;
  active: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  chipPredicate?: (row: T, activeChipIds: string[]) => boolean;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyState?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  pageSize?: number;
  pageSizeOptions?: number[];
  paginationLabel?: string;
}

type SortDir = "asc" | "desc" | null;
interface SortState {
  columnId: string;
  dir: SortDir;
}

export function applySearch<T>(
  rows: T[],
  query: string,
  searchText: ((row: T) => string) | undefined,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q || !searchText) return rows;
  return rows.filter((row) => searchText(row).toLowerCase().includes(q));
}

export function applyChips<T>(
  rows: T[],
  activeChipIds: string[],
  chipPredicate: ((row: T, activeChipIds: string[]) => boolean) | undefined,
): T[] {
  if (activeChipIds.length === 0 || !chipPredicate) return rows;
  return rows.filter((row) => chipPredicate(row, activeChipIds));
}

export function applySort<T>(
  rows: T[],
  sort: SortState,
  columns: Pick<DataTableColumn<T>, "id" | "sortValue">[],
): T[] {
  if (sort.dir === null) return rows;
  const column = columns.find((c) => c.id === sort.columnId);
  if (!column?.sortValue) return rows;
  const accessor = column.sortValue;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

function nextDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  searchText,
  searchPlaceholder = "Buscar…",
  chips,
  chipPredicate,
  onRowClick,
  isLoading,
  emptyState,
  rowActions,
  pageSize,
  pageSizeOptions = [8, 16, 32],
  paginationLabel = "registros",
}: DataTableProps<T>) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ columnId: "", dir: null });
  const [activeChipIds, setActiveChipIds] = useState<string[]>(
    () => chips?.filter((c) => c.active).map((c) => c.id) ?? [],
  );
  const [size, setSize] = useState(pageSize ?? 0);
  const [page, setPage] = useState(1);

  const visibleRows = useMemo(() => {
    const searched = applySearch(rows, query, searchText);
    const filtered = applyChips(searched, activeChipIds, chipPredicate);
    return applySort(filtered, sort, columns);
  }, [rows, query, searchText, activeChipIds, chipPredicate, sort, columns]);

  const total = visibleRows.length;
  const pageCount = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  useEffect(() => {
    setPage(1);
  }, [total, size]);
  const pagedRows = size > 0 ? visibleRows.slice((page - 1) * size, page * size) : visibleRows;
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  const toggleChip = (id: string) =>
    setActiveChipIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const colSpan = columns.length + (rowActions ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {(searchText || (chips && chips.length > 0)) && (
        <div className="flex flex-wrap items-center gap-3">
          {searchText && (
            <div className="relative min-w-[220px] flex-1">
              <label htmlFor={searchId} className="sr-only">
                {searchPlaceholder}
              </label>
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">
                {Icon.search({ s: 18 })}
              </span>
              <Input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-11 pl-11"
              />
            </div>
          )}
          {chips && chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => {
                const active = activeChipIds.includes(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleChip(chip.id)}
                    className={cn(
                      "rounded-pill border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 ease-expo",
                      active
                        ? "border-jci-blue bg-jci-blue/12 text-jci-blue"
                        : "border-line-strong text-ink-2 hover:border-[rgba(19,15,45,0.26)] hover:text-ink-1",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={cn(cardSurfaceClasses, "overflow-hidden")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-2 hover:bg-surface-2">
              {columns.map((column) => {
                const isSortable = column.sortable ?? Boolean(column.sortValue);
                const isSorted = sort.columnId === column.id && sort.dir !== null;
                const ariaSort = !isSorted
                  ? "none"
                  : sort.dir === "asc"
                    ? "ascending"
                    : "descending";
                return (
                  <TableHead key={column.id} aria-sort={isSortable ? ariaSort : undefined}>
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSort((prev) =>
                            prev.columnId === column.id
                              ? { columnId: column.id, dir: nextDir(prev.dir) }
                              : { columnId: column.id, dir: "asc" },
                          )
                        }
                        className="inline-flex items-center gap-1 uppercase transition-colors hover:text-ink-1"
                      >
                        {column.header}
                        <span
                          className={cn(
                            "text-ink-3 transition-transform duration-200 ease-expo",
                            isSorted && sort.dir === "asc" && "rotate-180",
                          )}
                        >
                          {Icon.chevExpand({ s: 14 })}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
              {rowActions && (
                <TableHead className="w-px text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  {emptyState ?? (
                    <EmptyState
                      icon={Icon.search({ s: 28 })}
                      title="Sin resultados"
                      description="No hay filas que coincidan con tu búsqueda o filtros."
                    />
                  )}
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {columns.map((column) => (
                    <TableCell key={column.id}>{column.cell(row)}</TableCell>
                  ))}
                  {rowActions && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {pageSize && !isLoading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5 text-[13px] text-ink-3">
            <span>
              Mostrando {from}–{to} de {total} {paginationLabel}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-ink-3">Por página</span>
              <Select
                value={String(size)}
                onChange={(e) => setSize(Number(e.target.value))}
                aria-label="Filas por página"
                className="h-9 w-auto"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <IconButton
                  as="button"
                  size="sm"
                  variant="subtle"
                  className="hover:bg-jci-blue-25/60 hover:text-jci-blue"
                  aria-label="Página anterior"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <span className="inline-flex rotate-180">{Icon.chevRight({ s: 16 })}</span>
                </IconButton>
                {pageWindow(page, pageCount).map((tok, i) =>
                  tok === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1.5 text-ink-3">
                      …
                    </span>
                  ) : (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => setPage(tok)}
                      aria-current={tok === page ? "page" : undefined}
                      className={cn(
                        "min-w-8 rounded-md px-2 py-1 text-[13px] font-semibold transition-colors",
                        tok === page
                          ? "bg-jci-blue text-white shadow-[0_2px_8px_-2px_rgba(0,151,215,0.5)]"
                          : "text-ink-2 hover:bg-jci-blue-25/60 hover:text-jci-blue",
                      )}
                    >
                      {tok}
                    </button>
                  ),
                )}
                <IconButton
                  as="button"
                  size="sm"
                  variant="subtle"
                  className="hover:bg-jci-blue-25/60 hover:text-jci-blue"
                  aria-label="Página siguiente"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  {Icon.chevRight({ s: 16 })}
                </IconButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
