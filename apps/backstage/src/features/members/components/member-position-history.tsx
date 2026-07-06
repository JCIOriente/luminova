import { Card } from "@luminova/ui";
import { type Member, type MemberGender, type Position, type TermPositions } from "@luminova/types";
import { MemberCargoChips } from "./member-cargo-chips";

type PastTerm = { key: string; termPositions: TermPositions };

export function MemberPositionHistory({
  member,
  positionsById,
  currentTermKey,
}: {
  member: { gender?: MemberGender; positions?: Member["positions"] };
  positionsById: Map<string, Position>;
  currentTermKey: string;
}) {
  const allPositions = member.positions ?? {};
  const pastTerms: PastTerm[] = Object.entries(allPositions)
    .filter(([term]) => term !== currentTermKey)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([key, termPositions]) => ({ key, termPositions }));

  if (pastTerms.length === 0) return null;

  return (
    <Card as="section" aria-labelledby="historial-cargos-title" className="flex flex-col gap-3">
      <h2
        id="historial-cargos-title"
        className="text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase"
      >
        Historial
      </h2>
      <ul className="flex flex-col gap-3">
        {pastTerms.map(({ key, termPositions }) => (
          <li key={key} className="flex items-center gap-3">
            <span data-testid="history-term" className="tabular-nums text-ui-sm text-ink-3">
              {key}
            </span>
            <MemberCargoChips
              member={{ gender: member.gender, positions: { [key]: termPositions } }}
              positionsById={positionsById}
              termKey={key}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
