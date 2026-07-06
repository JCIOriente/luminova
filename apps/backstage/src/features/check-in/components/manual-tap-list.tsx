import { useMemo, useState } from "react";
import { Avatar, Card, Icon, Input } from "@luminova/ui";
import type { Member } from "@luminova/types";

interface ManualTapListProps {
  members: Member[];
  checkedInIds: string[];
  onTap: (memberId: string) => void;
}

/** Add-by-name search: matches appear only once the operator types, so the field
 *  sits quietly next to the scanner until it's needed. */
export function ManualTapList({ members, checkedInIds, onTap }: ManualTapListProps) {
  const [search, setSearch] = useState("");
  const checkedIn = useMemo(() => new Set(checkedInIds), [checkedInIds]);
  const term = search.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return [];
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          (m.profession?.toLowerCase().includes(term) ?? false),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 6);
  }, [members, term]);

  return (
    // p-3 around the 52px Input makes the tile's rest height match the 76px
    // scan card beside it (12 + 52 + 12); results grow inside the tile only.
    <Card padding="none" className="flex flex-col gap-2 p-3">
      <Input
        placeholder="o registra a un miembro por su nombre…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Buscar miembro"
      />
      {term &&
        (matches.length === 0 ? (
          <p className="px-1 text-ui-sm text-ink-3">Sin resultados</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {matches.map((member) => {
              const done = checkedIn.has(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => onTap(member.id)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-2 text-left text-ui-md text-ink-1 transition-colors hover:border-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Avatar src={member.profilePicture} name={member.name} size={28} />
                    <span className="flex-1 truncate">{member.name}</span>
                    <span
                      className={`grid size-7 place-items-center rounded-full ${
                        done ? "bg-ok/15 text-ok" : "bg-jci-blue/10 text-jci-blue"
                      }`}
                      aria-hidden="true"
                    >
                      {done ? Icon.check({ s: 16 }) : Icon.plus({ s: 16 })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </Card>
  );
}
