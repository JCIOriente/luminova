import { Fragment, type ReactNode } from "react";
import type { Role } from "@luminova/auth/roles";
import {
  Badge,
  Button,
  Card,
  type ChartSeries,
  Icon,
  KpiCard,
  type KpiTone,
  LineChart,
  cardInteractiveClasses,
  cardSurfaceClasses,
  cn,
} from "@luminova/ui";
import { PageHeader } from "../page-header";
import { EventDateChip } from "../event-date-chip";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";
import { inDaysEs } from "../../features/members/lib/milestones";
import { relativeTimeEs } from "@luminova/utils/datetime";
import type { DashboardKpi, DashboardModel, FeedTone } from "./dashboard-model";

const WHITESPACE = /\s+/;

function firstName(value: string): string {
  return value.trim().split(WHITESPACE)[0] ?? value;
}

const FEED_DOT: Record<FeedTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  green: "bg-ok/14 text-ok",
};

const quickActionCardClasses = cn(
  cardSurfaceClasses,
  cardInteractiveClasses,
  "group flex flex-col items-start gap-3.5 p-[18px] text-left",
);

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

  // A null KPI is UNKNOWN — the query feeding it is gated on a capability this principal
  // lacks and never ran. Omit the tile; rendering it would state a count (0) as fact.
  const kpiTiles: {
    key: string;
    icon: ReactNode;
    tone: KpiTone;
    label: string;
    kpi: DashboardKpi;
  }[] = [];
  if (model.kpis.activeMembers) {
    kpiTiles.push({
      key: "activeMembers",
      icon: Icon.user({ s: 20 }),
      tone: "blue",
      label: "Miembros activos",
      kpi: model.kpis.activeMembers,
    });
  }
  kpiTiles.push({
    key: "upcomingEvents",
    icon: Icon.calendar({ s: 20 }),
    tone: "teal",
    label: "Próximos eventos",
    kpi: model.kpis.upcomingEvents,
  });
  if (model.kpis.allies) {
    kpiTiles.push({
      key: "allies",
      icon: Icon.handshake({ s: 20 }),
      tone: "navy",
      label: "Aliados",
      kpi: model.kpis.allies,
    });
  }
  kpiTiles.push({
    key: "pointsThisMonth",
    icon: Icon.barChart({ s: 20 }),
    tone: "amber",
    label: "Puntos otorgados (mes)",
    kpi: model.kpis.pointsThisMonth,
  });

  const widgets: Record<Exclude<WidgetKey, "headerActions">, () => ReactNode> = {
    kpis: () => (
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {kpiTiles.map((t) => (
          <KpiCard
            key={t.key}
            icon={t.icon}
            tone={t.tone}
            label={t.label}
            value={t.kpi.value}
            trend={t.kpi.trend}
          />
        ))}
      </div>
    ),
    chart: () => (
      <Card as="section" padding="none">
        <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] pt-5 pb-4">
          <div>
            <h2 className="text-ui-lg font-semibold tracking-[-0.01em] text-ink-1">
              Puntos otorgados por mes
            </h2>
            <p className="text-ui-xs text-ink-3">Total del capítulo en la gestión</p>
          </div>
        </div>
        <div className="px-[22px] pb-[22px] text-jci-black">
          {model.pointsByMonth.length === 0 ? (
            <p className="py-10 text-center text-ui-sm text-ink-3">Aún no hay puntos otorgados.</p>
          ) : (
            <LineChart series={chartSeries} height={280} />
          )}
        </div>
      </Card>
    ),
    upcomingEvents: () => (
      <Card as="section" padding="none">
        <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
          <h2 className="text-ui-lg font-semibold text-ink-1">Próximos eventos</h2>
        </div>
        <div className="px-3 pb-3">
          {model.upcomingEvents.length === 0 ? (
            <p className="px-3 py-8 text-center text-ui-sm text-ink-3">No hay eventos próximos.</p>
          ) : (
            model.upcomingEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-4 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-ink-1/[0.04]"
              >
                <EventDateChip month={e.month} day={e.day} />
                <div className="min-w-0 flex-1">
                  <div className="text-ui-md font-semibold text-ink-1">{e.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-ui-xs text-ink-3">
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
    // Null = the members read this derives from was never allowed to run. Omit the whole
    // card: "Sin cumpleaños próximos" would be a claim about data we did not fetch.
    birthdays: () =>
      model.birthdays === null ? null : (
        <Card as="section" padding="none">
          <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
            <h2 className="text-ui-lg font-semibold text-ink-1">Próximos cumpleaños</h2>
          </div>
          <div className="px-3 pb-3">
            {model.birthdays.length === 0 ? (
              <p className="px-3 py-8 text-center text-ui-sm text-ink-3">
                Sin cumpleaños próximos.
              </p>
            ) : (
              model.birthdays.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-4 rounded-[12px] px-3 py-3 transition-colors hover:bg-ink-1/[0.04]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="text-jci-blue">{Icon.heart({ s: 16 })}</span>
                    <span className="truncate text-ui-md font-semibold text-ink-1">{b.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-ui-xs text-ink-3">
                    <span className="font-medium text-ink-2">{b.label}</span>
                    <span className="size-[3px] rounded-full bg-ink-3" />
                    <span>{inDaysEs(b.days)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      ),
    recentActivity: () =>
      model.feed === null ? null : (
        <Card as="section" padding="none" className="px-[22px] py-5">
          <h2 className="mb-4 text-ui-lg font-semibold text-ink-1">Actividad reciente</h2>
          {model.feed.length === 0 ? (
            <p className="py-6 text-center text-ui-sm text-ink-3">Sin actividad reciente.</p>
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
                    <div className="text-ui-sm leading-snug text-ink-2">
                      <b className="font-semibold text-ink-1">{a.strong}</b>
                      {a.text}
                    </div>
                    <div className="mt-1 text-ui-xs text-ink-3 tabular-nums">
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
        <h2 className="mb-3 text-ui-lg font-semibold text-ink-1">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {QUICK_ACTIONS.map((q) => (
            <button key={q.id} type="button" className={quickActionCardClasses}>
              <span className="flex size-[42px] items-center justify-center rounded-[12px] bg-jci-blue/10 text-jci-blue">
                {Icon[q.icon]({ s: 21 })}
              </span>
              <span>
                <span className="block text-ui-md font-semibold text-ink-1">{q.title}</span>
                <span className="mt-1 block text-ui-xs leading-snug text-ink-3">{q.desc}</span>
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
