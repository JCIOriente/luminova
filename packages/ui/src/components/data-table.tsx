import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icons";
import { Input } from "./input";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

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
}: DataTableProps<T>) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ columnId: "", dir: null });
  const [activeChipIds, setActiveChipIds] = useState<string[]>(
    () => chips?.filter((c) => c.active).map((c) => c.id) ?? [],
  );

  const visibleRows = useMemo(() => {
    const searched = applySearch(rows, query, searchText);
    const filtered = applyChips(searched, activeChipIds, chipPredicate);
    return applySort(filtered, sort, columns);
  }, [rows, query, searchText, activeChipIds, chipPredicate, sort, columns]);

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

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const isSortable = column.sortable ?? Boolean(column.sortValue);
              const isSorted = sort.columnId === column.id && sort.dir !== null;
              const ariaSort = !isSorted ? "none" : sort.dir === "asc" ? "ascending" : "descending";
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
            {rowActions && <TableHead className="text-right">Acciones</TableHead>}
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
            visibleRows.map((row) => (
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
    </div>
  );
}
