import { Avatar } from "@luminova/ui";
import type { RosterEntry } from "../roster";

interface RosterListProps {
  entries: RosterEntry[];
}

export function RosterList({ entries }: RosterListProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
          Lista de presentes
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-ink-1">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-[10px] bg-ink-1/[0.03] px-4 py-6 text-center text-[13px] text-ink-3">
          Nadie ha registrado asistencia aún.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li
              key={entry.memberId}
              className="flex items-center gap-3 rounded-[10px] bg-ink-1/[0.03] px-4 py-2.5 text-[14px] text-ink-1"
            >
              <Avatar src={entry.src} name={entry.name} size={28} />
              <span className="truncate">{entry.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
