import type { RosterEntry } from "../roster";

interface RosterListProps {
  entries: RosterEntry[];
}

export function RosterList({ entries }: RosterListProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
        {entries.length} presentes
      </div>
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nadie ha registrado asistencia aún.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li
              key={entry.memberId}
              className="rounded-[10px] bg-ink-1/[0.03] px-4 py-2.5 text-[14px] text-ink-1"
            >
              {entry.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
