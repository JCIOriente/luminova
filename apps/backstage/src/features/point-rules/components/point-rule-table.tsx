import { useMemo, useState } from "react";
import { DataTable, Input, Button, type DataTableColumn } from "@luminova/ui";
import { pointRuleSchema } from "@luminova/types";
import type { PointRule } from "@luminova/types";
import { useAbility } from "../../../lib/authz/ability-context";

const pointsSchema = pointRuleSchema.shape.points;

interface PointRuleTableProps {
  rules: PointRule[];
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}

function buildColumns(
  canEdit: boolean,
  onSave: (id: string, points: number) => void,
  isSaving: boolean,
): DataTableColumn<PointRule>[] {
  return [
    {
      id: "label",
      header: "Regla",
      sortValue: (rule) => rule.label,
      cell: (rule) => <span className="text-ink-1">{rule.label}</span>,
    },
    {
      id: "points",
      header: "Puntos",
      sortValue: (rule) => rule.points,
      cell: (rule) =>
        canEdit ? (
          <PointsCell rule={rule} onSave={onSave} isSaving={isSaving} />
        ) : (
          <span className="tabular-nums text-ink-2">{rule.points}</span>
        ),
    },
  ];
}

export function PointRuleTable({ rules, onSave, isSaving }: PointRuleTableProps) {
  const ability = useAbility();
  const canEdit = ability.can("update", "PointRule");
  const columns = useMemo(
    () => buildColumns(canEdit, onSave, isSaving),
    [canEdit, onSave, isSaving],
  );
  return <DataTable rows={rules} columns={columns} getRowId={(rule) => rule.id} />;
}

function PointsCell({
  rule,
  onSave,
  isSaving,
}: {
  rule: PointRule;
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState(String(rule.points));
  const parsed = pointsSchema.safeParse(Number(value));
  const changed = value.trim() !== "" && Number(value) !== rule.points;

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        step={1}
        className="w-24 px-3 py-2"
        value={value}
        aria-label={`Puntos de ${rule.label}`}
        onChange={(event) => setValue(event.target.value)}
      />
      {changed && (
        <Button
          as="button"
          variant="primary"
          size="sm"
          disabled={!parsed.success || isSaving}
          aria-label={`Guardar ${rule.label}`}
          onClick={() => parsed.success && onSave(rule.id, parsed.data)}
        >
          Guardar
        </Button>
      )}
    </div>
  );
}
