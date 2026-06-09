import { Fragment, type ReactNode } from "react";
import type { Role } from "@luminova/auth/roles";
import { Badge, Button, Icon, KpiCard, LineChart } from "@luminova/ui";
import { PageHeader } from "../page-header";
import { OVERVIEW_MOCK } from "./overview-mock";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";

const WHITESPACE = /\s+/;

function firstName(value: string): string {
  return value.trim().split(WHITESPACE)[0] ?? value;
}

type ActivityTone = (typeof OVERVIEW_MOCK.activity)[number]["tone"];

const ACTIVITY_DOT: Record<ActivityTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  green: "bg-ok/14 text-ok",
};

export function OverviewView({
  memberCount,
  allyCount,
  userName,
  roles = [],
}: {
  memberCount: number;
  allyCount: number;
  userName: string;
  roles?: readonly Role[];
}) {
  const m = OVERVIEW_MOCK;
  const layout = boardHomeLayout(roles);
  const visible = new Set(layout);

  const headerActions = (
    <>
      <Button
        as="button"
        type="button"
        variant="secondary"
        size="sm"
        iconLeft={Icon.user({ s: 18 })}
      >
        Invitar miembro
      </Button>
      <Button as="button" type="button" size="sm" iconLeft={Icon.plus({ s: 18 })}>
        Crear evento
      </Button>
    </>
  );

  const widgets: Record<Exclude<WidgetKey, "headerActions">, () => ReactNode> = {
    kpis: () => (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Icon.user({ s: 20 })}
          tone="blue"
          label="Miembros activos"
          value={memberCount}
          trend={{ dir: "up", label: "+8 · este trimestre" }}
          spark={m.membersTrendSpark}
        />
        <KpiCard
          icon={Icon.calendar({ s: 20 })}
          tone="teal"
          label="Próximos eventos"
          value={m.kpis.upcomingEvents.value}
          trend={m.kpis.upcomingEvents.trend}
          spark={m.kpis.upcomingEvents.spark}
        />
        <KpiCard
          icon={Icon.handshake({ s: 20 })}
          tone="navy"
          label="Aliados"
          value={allyCount}
          trend={{ dir: "up", label: "+1 · este mes" }}
          spark={m.alliesTrendSpark}
        />
        <KpiCard
          icon={Icon.check({ s: 20 })}
          tone="amber"
          label="Tareas pendientes"
          value={m.kpis.pendingTasks.value}
          trend={m.kpis.pendingTasks.trend}
          spark={m.kpis.pendingTasks.spark}
        />
      </div>
    ),
    chart: () => (
      <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] pt-5 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-1">
              Membresía y asistencia
            </h2>
            <p className="text-[12.5px] text-ink-3">Miembros activos vs. asistentes a eventos</p>
          </div>
          <div className="flex items-center gap-4">
            {m.chart.map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2"
              >
                <span className="h-[3px] w-[18px] rounded" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="px-[22px] pb-[22px] text-jci-black">
          <LineChart series={m.chart} height={280} />
        </div>
      </section>
    ),
    upcomingEvents: () => (
      <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
          <h2 className="text-[16px] font-semibold text-ink-1">Próximos eventos</h2>
          <span className="text-[13px] font-semibold text-jci-blue">Ver todos</span>
        </div>
        <div className="px-3 pb-3">
          {m.upcomingEvents.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-4 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-ink-1/[0.04]"
            >
              <div className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[11px] border border-line bg-surface-2">
                <span className="text-[10px] font-bold tracking-[0.1em] text-jci-blue uppercase">
                  {e.month}
                </span>
                <span className="text-[21px] font-medium leading-none tracking-[-0.02em] text-ink-1">
                  {e.day}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold text-ink-1">{e.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                  <span>{e.time}</span>
                  <span className="size-[3px] rounded-full bg-ink-3" />
                  <span>{e.place}</span>
                </div>
              </div>
              <Badge tone={e.status.tone} dot>
                {e.status.label}
              </Badge>
            </div>
          ))}
        </div>
      </section>
    ),
    recentActivity: () => (
      <section className="rounded-[16px] border border-line bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <h2 className="mb-4 text-[16px] font-semibold text-ink-1">Actividad reciente</h2>
        <div className="flex flex-col gap-4">
          {m.activity.map((a) => (
            <div key={a.id} className="flex gap-3.5">
              <span
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${ACTIVITY_DOT[a.tone]}`}
              >
                {Icon.bell({ s: 15 })}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-snug text-ink-2">
                  {a.segments.map((seg, i) =>
                    "strong" in seg && seg.strong ? (
                      <b key={i} className="font-semibold text-ink-1">
                        {seg.text}
                      </b>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </div>
                <div className="mt-1 text-[11.5px] text-ink-3 tabular-nums">{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    ),
    quickActions: () => (
      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-ink-1">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {m.quickActions.map((q) => (
            <button
              key={q.id}
              type="button"
              className="group flex flex-col items-start gap-3.5 rounded-[14px] border border-line bg-surface p-[18px] text-left shadow-[0_1px_2px_rgba(19,15,45,0.05)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]"
            >
              <span className="flex size-[42px] items-center justify-center rounded-[12px] bg-jci-blue/10 text-jci-blue">
                {Icon[q.icon]({ s: 21 })}
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-ink-1">{q.title}</span>
                <span className="mt-1 block text-[12.5px] leading-snug text-ink-3">{q.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    ),
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        eyebrow="Inicio"
        title={`Hola, ${firstName(userName)}`}
        subtitle="Esto es lo que necesita tu atención hoy."
        actions={visible.has("headerActions") ? headerActions : undefined}
      />

      {layout
        .filter((key): key is Exclude<WidgetKey, "headerActions"> => key !== "headerActions")
        .map((key) => (
          <Fragment key={key}>{widgets[key]()}</Fragment>
        ))}
    </div>
  );
}
