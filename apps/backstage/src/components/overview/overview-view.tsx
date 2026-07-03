import { Fragment, type ReactNode } from "react";
import type { Role } from "@luminova/auth/roles";
import {
  Badge,
  Button,
  Card,
  type ChartSeries,
  Icon,
  KpiCard,
  LineChart,
  cardSurfaceClasses,
  cn,
} from "@luminova/ui";
import { PageHeader } from "../page-header";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";
import { relativeTimeEs } from "../../lib/datetime";
import type { DashboardModel, FeedTone } from "./dashboard-model";

const WHITESPACE = /\s+/;

function firstName(value: string): string {
  return value.trim().split(WHITESPACE)[0] ?? value;
}

const FEED_DOT: Record<FeedTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  green: "bg-ok/14 text-ok",
};

const QUICK_ACTIONS = [
  {
    id: "q1",
    icon: "plus",
    title: "Crear evento",
    desc: "Programa una nueva actividad del capítulo",
  },
  {
    id: "q2",
    icon: "user",
    title: "Invitar miembro",
    desc: "Suma a alguien a la membresía activa",
  },
  {
    id: "q3",
    icon: "handshake",
    title: "Registrar aliado",
    desc: "Añade una empresa u organización aliada",
  },
  {
    id: "q4",
    icon: "barChart",
    title: "Ver reportes",
    desc: "Indicadores y exportes del capítulo",
  },
] as const satisfies readonly {
  id: string;
  icon: keyof typeof Icon;
  title: string;
  desc: string;
}[];

export function OverviewView({
  model,
  userName,
  now,
  roles = [],
}: {
  model: DashboardModel;
  userName: string;
  now: Date;
  roles?: readonly Role[];
}) {
  const layout = boardHomeLayout(roles);
  const chartSeries: ChartSeries[] = [
    {
      label: "Puntos otorgados",
      color: "var(--color-jci-blue)",
      values: model.pointsByMonth.map((p) => p.points),
    },
  ];

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
          value={model.kpis.activeMembers.value}
          trend={model.kpis.activeMembers.trend}
        />
        <KpiCard
          icon={Icon.calendar({ s: 20 })}
          tone="teal"
          label="Próximos eventos"
          value={model.kpis.upcomingEvents.value}
          trend={model.kpis.upcomingEvents.trend}
        />
        <KpiCard
          icon={Icon.handshake({ s: 20 })}
          tone="navy"
          label="Aliados"
          value={model.kpis.allies.value}
          trend={model.kpis.allies.trend}
        />
        <KpiCard
          icon={Icon.barChart({ s: 20 })}
          tone="amber"
          label="Puntos otorgados (mes)"
          value={model.kpis.pointsThisMonth.value}
          trend={model.kpis.pointsThisMonth.trend}
        />
      </div>
    ),
    chart: () => (
      <Card as="section" padding="none">
        <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] pt-5 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-1">
              Puntos otorgados por mes
            </h2>
            <p className="text-[12.5px] text-ink-3">Total del capítulo en la gestión</p>
          </div>
        </div>
        <div className="px-[22px] pb-[22px] text-jci-black">
          {model.pointsByMonth.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-3">Aún no hay puntos otorgados.</p>
          ) : (
            <LineChart series={chartSeries} height={280} />
          )}
        </div>
      </Card>
    ),
    upcomingEvents: () => (
      <Card as="section" padding="none">
        <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
          <h2 className="text-[16px] font-semibold text-ink-1">Próximos eventos</h2>
        </div>
        <div className="px-3 pb-3">
          {model.upcomingEvents.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">No hay eventos próximos.</p>
          ) : (
            model.upcomingEvents.map((e) => (
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
            ))
          )}
        </div>
      </Card>
    ),
    recentActivity: () => (
      <Card as="section" padding="none" className="px-[22px] py-5">
        <h2 className="mb-4 text-[16px] font-semibold text-ink-1">Actividad reciente</h2>
        {model.feed.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">Sin actividad reciente.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {model.feed.map((a) => (
              <div key={`${a.tone}-${a.id}`} className="flex gap-3.5">
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${FEED_DOT[a.tone]}`}
                >
                  {Icon.bell({ s: 15 })}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] leading-snug text-ink-2">
                    <b className="font-semibold text-ink-1">{a.strong}</b>
                    {a.text}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-3 tabular-nums">
                    {relativeTimeEs(a.at, now)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    quickActions: () => (
      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-ink-1">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              className={cn(
                cardSurfaceClasses,
                "group flex flex-col items-start gap-3.5 p-[18px] text-left transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]",
              )}
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
        actions={layout.includes("headerActions") ? headerActions : undefined}
      />

      {layout
        .filter((key): key is Exclude<WidgetKey, "headerActions"> => key !== "headerActions")
        .map((key) => (
          <Fragment key={key}>{widgets[key]()}</Fragment>
        ))}
    </div>
  );
}
