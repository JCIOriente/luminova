import { useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Input } from "@luminova/ui";
import { pointRuleSchema } from "@luminova/types";
import type { PointRule } from "@luminova/types";
import { useAbility } from "../../../lib/authz/ability-context";

const pointsSchema = pointRuleSchema.shape.points;

interface PointRuleTableProps {
  rules: PointRule[];
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}

export function PointRuleTable({ rules, onSave, isSaving }: PointRuleTableProps) {
  const ability = useAbility();
  const canEdit = ability.can("update", "PointRule");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Regla</TableHead>
          <TableHead className="w-48">Puntos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <PointRuleRow
            key={rule.id}
            rule={rule}
            canEdit={canEdit}
            onSave={onSave}
            isSaving={isSaving}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function PointRuleRow({
  rule,
  canEdit,
  onSave,
  isSaving,
}: {
  rule: PointRule;
  canEdit: boolean;
  onSave: (id: string, points: number) => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState(String(rule.points));

  if (!canEdit) {
    return (
      <TableRow>
        <TableCell>{rule.label}</TableCell>
        <TableCell className="tabular-nums">{rule.points}</TableCell>
      </TableRow>
    );
  }

  const parsed = pointsSchema.safeParse(Number(value));
  const changed = value.trim() !== "" && Number(value) !== rule.points;
  const valid = parsed.success;

  return (
    <TableRow>
      <TableCell>{rule.label}</TableCell>
      <TableCell>
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
            <button
              type="button"
              disabled={!valid || isSaving}
              aria-label={`Guardar ${rule.label}`}
              onClick={() => parsed.success && onSave(rule.id, parsed.data)}
              className="rounded-pill bg-jci-blue px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-jci-navy disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
