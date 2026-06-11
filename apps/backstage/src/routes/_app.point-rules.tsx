import { createFileRoute } from "@tanstack/react-router";
import { Button, EmptyState, Icon } from "@luminova/ui";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermKey } from "@luminova/types";
import { usePointRules } from "../features/point-rules/hooks/use-point-rules";
import { useSeedPointRules } from "../features/point-rules/hooks/use-seed-point-rules";
import { useUpdatePointRule } from "../features/point-rules/hooks/use-update-point-rule";
import { PointRuleTable } from "../features/point-rules/components/point-rule-table";

export const Route = createFileRoute("/_app/point-rules")({
  component: PointRulesPage,
});

function PointRulesPage() {
  const termId = currentTermKey();
  const { data: rules, isLoading, isError } = usePointRules(termId);
  const seed = useSeedPointRules();
  const update = useUpdatePointRule(termId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Reconocimiento" title="Reglas de puntos" />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar las reglas.</p>}
      {rules && rules.length === 0 && (
        <EmptyState
          icon={Icon.target({ s: 40 })}
          title={`No hay reglas de puntos para ${termId}.`}
          description="Inicializa la matriz del Mejor Miembro Individual para esta gestión."
          action={
            <Can I="create" a="PointRule">
              <Button
                as="button"
                type="button"
                iconLeft={Icon.plus({ s: 18 })}
                onClick={() => seed.mutate(termId)}
              >
                Inicializar
              </Button>
            </Can>
          }
        />
      )}
      {rules && rules.length > 0 && (
        <PointRuleTable
          rules={rules}
          isSaving={update.isPending}
          onSave={(id, points) => update.mutate({ id, points })}
        />
      )}
    </div>
  );
}
