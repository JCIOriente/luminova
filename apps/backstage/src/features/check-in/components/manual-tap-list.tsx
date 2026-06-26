import { useMemo, useState } from "react";
import { Avatar, Icon, Input } from "@luminova/ui";
import type { Member } from "@luminova/types";

interface ManualTapListProps {
  members: Member[];
  checkedInIds: string[];
  onTap: (memberId: string) => void;
}

export function ManualTapList({ members, checkedInIds, onTap }: ManualTapListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term ? members.filter((m) => m.name.toLowerCase().includes(term)) : members;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [members, search]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Buscar miembro…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Buscar miembro"
      />
      <ul className="flex flex-col gap-1">
        {filtered.map((member) => {
          const done = checkedInIds.includes(member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                disabled={done}
                onClick={() => onTap(member.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-2 text-left text-[14px] text-ink-1 transition-colors hover:border-jci-blue disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
