import type { ReactNode } from "react";
import { RippleSVG } from "@luminova/ui";
import type { MemberPoints } from "@luminova/types/engine";

interface MemberPointsSummaryProps {
  points: MemberPoints | null | undefined;
  termId: string;
  rank: { rank: number; total: number } | null;
  activityCount: number;
}

function Cell({
  eyebrow,
  children,
  label,
}: {
  eyebrow: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 sm:px-9 sm:first:pl-0">
      <div className="mb-4 font-mono text-[10.5px] tracking-[0.16em] text-on-dark-3 uppercase">
        {eyebrow}
      </div>
      <div className="leading-[0.95]">{children}</div>
      <div className="mt-3.5 text-[13.5px] leading-snug text-on-dark-2">{label}</div>
    </div>
  );
}

export function MemberPointsSummary({
  points,
  termId,
  rank,
  activityCount,
}: MemberPointsSummaryProps) {
  const months = Object.entries(points?.byMonth ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const last = months.at(-1);

  return (
    <div className="relative isolate flex flex-col gap-6 overflow-hidden rounded-[20px] bg-jci-black px-7 py-7 text-on-dark-1 shadow-[0_26px_60px_-34px_rgba(19,15,45,0.55)] sm:px-9 sm:py-8">
      <RippleSVG
        color="var(--color-jci-white)"
        size={520}
        className="pointer-events-none absolute top-1/2 -right-28 -z-10 size-[520px] -translate-y-1/2 opacity-[0.06] motion-safe:animate-ripple-spin"
      />

      <div className="grid gap-6 sm:grid-cols-[1.6fr_1fr_1fr] sm:gap-0 sm:divide-x sm:divide-white/15">
        <Cell eyebrow={`Puntos confirmados · ${termId}`} label="Acumulados esta temporada">
          <span className="text-[64px] font-light tracking-[-0.03em] text-jci-yellow tabular-nums sm:text-[70px]">
            {points?.cumulative ?? 0}
          </span>
          <span className="ml-2 text-[21px] text-on-dark-2">pts</span>
        </Cell>

        {rank && (
          <Cell eyebrow="Clasificación" label={`de ${rank.total} en el capítulo`}>
            <span className="text-[48px] font-light tabular-nums">{rank.rank}°</span>
          </Cell>
        )}

        <Cell
          eyebrow="Este período"
          label={activityCount === 1 ? "actividad registrada" : "actividades registradas"}
        >
          <span className="text-[48px] font-light tabular-nums">{activityCount}</span>
        </Cell>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-5">
        {last ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.14em] text-on-dark-3 uppercase">
              Último registro
            </span>
            <span className="text-[13.5px] font-medium tabular-nums text-on-dark-1">
              {last[0]} · <span className="font-semibold text-jci-yellow">+{last[1]} pts</span>
            </span>
          </div>
        ) : (
          <span className="text-[13.5px] text-on-dark-3">Sin registros todavía</span>
        )}
        <span className="font-serif text-[16px] text-jci-teal italic">Inspira.</span>
      </div>
    </div>
  );
}
