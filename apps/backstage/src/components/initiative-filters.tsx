import { AREAS_OF_OPPORTUNITY, AREA_OF_OPPORTUNITY_LABELS } from "@luminova/types";
import { SearchInput, Select, SegmentedControl } from "@luminova/ui";
import type { InitiativeFilter, InitiativeTab } from "../features/initiatives/lib/filter";

interface InitiativeFiltersProps {
  filter: InitiativeFilter;
  counts: Record<InitiativeTab, number>;
  onChange: (next: InitiativeFilter) => void;
}

export function InitiativeFilters({ filter, counts, onChange }: InitiativeFiltersProps) {
  const set = (patch: Partial<InitiativeFilter>) => onChange({ ...filter, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<InitiativeTab>
        aria-label="Estado"
        value={filter.tab}
        onChange={(tab) => set({ tab })}
        options={[
          {
            value: "todos",
            label: (
              <>
                Todos <Count n={counts.todos} />
              </>
            ),
          },
          {
            value: "activos",
            label: (
              <>
                Activos <Count n={counts.activos} />
              </>
            ),
          },
          {
            value: "completados",
            label: (
              <>
                Completados <Count n={counts.completados} />
              </>
            ),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<InitiativeFilter["kind"]>
          aria-label="Tipo"
          value={filter.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "all", label: "Todos" },
            { value: "Program", label: "Programa" },
            { value: "Project", label: "Proyecto" },
          ]}
        />

        <Select
          aria-label="Área de oportunidad"
          value={filter.area}
          onChange={(e) => set({ area: e.target.value as InitiativeFilter["area"] })}
          className="max-w-[240px]"
        >
          <option value="all">Todas las áreas</option>
          {AREAS_OF_OPPORTUNITY.map((a) => (
            <option key={a} value={a}>
              {AREA_OF_OPPORTUNITY_LABELS[a]}
            </option>
          ))}
        </Select>

        <SearchInput
          id="initiative-search"
          label="Buscar por título"
          size="sm"
          placeholder="Buscar…"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          className="ml-auto w-full max-w-[260px]"
        />
      </div>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 text-[11px] font-semibold opacity-70 tabular-nums">{n}</span>;
}
