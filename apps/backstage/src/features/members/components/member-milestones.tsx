import type { Member } from "@luminova/types";
import { Card, Icon } from "@luminova/ui";
import { daysUntilNextAnniversary, fullYearsBetween } from "@luminova/utils/datetime";
import { upcomingBirthdays } from "../lib/milestones";
import { WidgetHeader } from "../../../components/widget-header";
import { QueryErrorState } from "../../../components/query-error-state";

function birthdayLine(days: number): string {
  if (days === 0) return "¡Hoy es tu cumpleaños!";
  if (days === 1) return "Tu cumpleaños es mañana";
  return `Tu cumpleaños en ${days} días`;
}

function anniversaryLine(years: number): string {
  if (years <= 0) return "Tu primer año en JCI Oriente";
  if (years === 1) return "1 año como miembro";
  return `${years} años como miembro`;
}

function inDays(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

export function MemberMilestones({
  member,
  members,
  membersLoading,
  membersError,
  membersErrorValue,
  onRetryMembers,
  now,
}: {
  member: Member;
  members: Member[] | undefined;
  membersLoading: boolean;
  membersError: boolean;
  membersErrorValue: unknown;
  onRetryMembers: () => void;
  now: Date;
}) {
  const birthdayDays = daysUntilNextAnniversary(member.birthdate, now);
  const years = fullYearsBetween(member.joinDate, now);
  const others = members ? upcomingBirthdays(members, member.id, now, 5) : [];

  return (
    <Card as="section" padding="none" className="flex flex-col">
      <WidgetHeader
        title="Momentos"
        subtitle="Tus fechas y las del equipo"
        icon={Icon.spark({ s: 20 })}
      />

      <div className="flex flex-col gap-2 px-6 py-4">
        <p className="flex items-center gap-2 text-ui-sm font-semibold text-ink-1">
          <span className="text-jci-blue">{Icon.heart({ s: 16 })}</span>
          {birthdayLine(birthdayDays)}
        </p>
        <p className="flex items-center gap-2 text-ui-sm text-ink-2">
          <span className="text-ink-3">{Icon.spark({ s: 16 })}</span>
          {anniversaryLine(years)}
        </p>
      </div>

      <div className="border-t border-line px-6 py-4">
        <h3 className="mb-3 text-ui-xs font-semibold tracking-wide text-ink-3 uppercase">
          Próximos cumpleaños
        </h3>
        {membersError ? (
          <QueryErrorState error={membersErrorValue} onRetry={onRetryMembers} />
        ) : membersLoading ? (
          <p className="py-2 text-ui-xs text-ink-3">Cargando…</p>
        ) : others.length === 0 ? (
          <p className="py-2 text-ui-xs text-ink-3">Sin cumpleaños próximos.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {others.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-ui-sm text-ink-1">{b.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-ui-xs text-ink-3">
                  <span className="font-medium text-ink-2">{b.label}</span>
                  <span>·</span>
                  <span>{inDays(b.days)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
