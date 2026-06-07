import type { StatusFilter } from "../lib/member-filter";

interface MemberFilterMetaProps {
  shown: number;
  total: number;
  search: string;
  status: StatusFilter;
  onClearSearch: () => void;
  onClearStatus: () => void;
  onClearAll: () => void;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-[12.5px] font-medium text-ink-2">
      {label}
      <button
        type="button"
        aria-label={`Quitar filtro ${label}`}
        onClick={onRemove}
        className="text-ink-3 transition-colors hover:text-ink-1"
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

export function MemberFilterMeta({
  shown,
  total,
  search,
  status,
  onClearSearch,
  onClearStatus,
  onClearAll,
}: MemberFilterMetaProps) {
  const hasSearch = search.trim().length > 0;
  const hasStatus = status !== "Todos";
  const anyActive = hasSearch || hasStatus;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-3">
      <span>
        Mostrando {shown} de {total}
      </span>
      {hasStatus && <Chip label={`Estado: ${status}`} onRemove={onClearStatus} />}
      {hasSearch && <Chip label={`Buscar: "${search.trim()}"`} onRemove={onClearSearch} />}
      {anyActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="font-semibold text-jci-blue transition-colors hover:text-jci-navy"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
