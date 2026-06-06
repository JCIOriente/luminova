// ⚠️ MOCK DATA — placeholder content for Overview widgets that have no backend yet
// (events, projects, tasks, attendance history, activity feed). Real Members/Allies
// counts come from useMembers/useAllies in the route, NOT from here. Replace each
// block when its backend lands. Do not treat these numbers as real.

import type { ChartSeries } from "@luminova/ui";

export const OVERVIEW_MOCK = {
  kpis: {
    upcomingEvents: {
      value: 6,
      trend: { dir: "up", label: "+2 · vs. mes anterior" } as const,
      spark: [3, 4, 4, 5, 4, 6, 6],
    },
    pendingTasks: {
      value: 12,
      trend: { dir: "down", label: "−3 · esta semana" } as const,
      spark: [18, 16, 15, 14, 13, 12, 12],
    },
  },
  membersTrendSpark: [120, 124, 128, 130, 134, 138, 142],
  alliesTrendSpark: [3, 4, 4, 5, 5, 6, 6],
  chart: [
    {
      label: "Miembros activos",
      color: "#0097D7",
      values: [116, 120, 119, 124, 128, 127, 132, 136, 134, 139, 141, 142],
    },
    {
      label: "Asistencia a eventos",
      color: "#57BCBC",
      values: [128, 142, 138, 130, 126, 148, 150, 140, 152, 149, 155, 158],
    },
  ] satisfies ChartSeries[],
  upcomingEvents: [
    {
      id: "e1",
      month: "JUN",
      day: "14",
      title: "Asamblea General Ordinaria",
      time: "19:00",
      place: "Sede JCI · Equipetrol",
      status: { tone: "green", label: "Confirmado" } as const,
    },
    {
      id: "e2",
      month: "JUN",
      day: "21",
      title: "Capacitación: Liderazgo Consciente",
      time: "09:00",
      place: "Hotel Los Tajibos",
      status: { tone: "blue", label: "Inscripciones abiertas" } as const,
    },
    {
      id: "e3",
      month: "JUN",
      day: "28",
      title: "Proyecto Sonrisas — Jornada",
      time: "08:30",
      place: "Plan 3000",
      status: { tone: "amber", label: "Planificación" } as const,
    },
  ],
  activity: [
    {
      id: "a1",
      tone: "blue" as const,
      segments: [
        { text: "Camila Áñez", strong: true },
        { text: " creó el evento " },
        { text: "Asamblea General", strong: true },
      ],
      time: "Hace 2 h",
    },
    {
      id: "a2",
      tone: "teal" as const,
      segments: [{ text: "Sergio Roca", strong: true }, { text: " se unió como nuevo miembro" }],
      time: "Hace 5 h",
    },
    {
      id: "a3",
      tone: "green" as const,
      segments: [
        { text: "Proyecto " },
        { text: "Sonrisas", strong: true },
        { text: " avanzó a " },
        { text: "70%", strong: true },
      ],
      time: "Ayer",
    },
  ],
  quickActions: [
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
  ],
} as const;
