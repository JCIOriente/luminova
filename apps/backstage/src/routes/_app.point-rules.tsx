import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, EmptyState, Icon, Toast } from "@luminova/ui";
import { ActionGate } from "../lib/authz/action-gate";
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
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

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
            // Seed batch-writes terms/{termId} too, which is Admin-role-only
            // (firestore.rules) — gate on the role, not just create:PointRule.
            <ActionGate role={["Admin"]}>
              <Button
                as="button"
                type="button"
                iconLeft={Icon.plus({ s: 18 })}
                onClick={() =>
                  seed.mutate(termId, {
                    onError: () => setToast("No se pudieron inicializar las reglas."),
                  })
                }
              >
                Inicializar
              </Button>
            </ActionGate>
          }
        />
      )}
      {rules && rules.length > 0 && (
        <PointRuleTable
          rules={rules}
          isSaving={update.isPending}
          onSave={(id, points) =>
            update.mutate(
              { id, points },
              { onError: () => setToast("No se pudo guardar la regla.") },
            )
          }
        />
      )}
      {toast && <Toast message={toast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
