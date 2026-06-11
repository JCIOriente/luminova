import { Badge } from "@luminova/ui";
import { positionTitle, type Member, type MemberGender, type Position } from "@luminova/types";
import { CATEGORY_TONE } from "../../positions/lib/category-tone";

export { CATEGORY_TONE };

type ChipSource = { gender?: MemberGender; positions?: Member["positions"] };

export function MemberCargoChips({
  member,
  positionsById,
  termKey,
}: {
  member: ChipSource;
  positionsById: Map<string, Position>;
  termKey: string;
}) {
  const term = member.positions?.[termKey];
  const cargo = term?.cargoId ? positionsById.get(term.cargoId) : undefined;
  const comisiones = (term?.comisionIds ?? [])
    .map((id) => positionsById.get(id))
    .filter((p): p is Position => Boolean(p));

  if (!cargo && comisiones.length === 0) return <Badge tone="gray">Miembro</Badge>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {cargo && (
        <Badge tone={CATEGORY_TONE[cargo.category]}>
          {positionTitle(cargo, member.gender)}
        </Badge>
      )}
      {comisiones.map((c) => (
        <Badge key={c.id} tone="gray">
          {positionTitle(c, member.gender)}
        </Badge>
      ))}
    </div>
  );
}
