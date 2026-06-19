import type { SiteConfig } from "@luminova/types";

export const SITE_CONFIG_DEFAULTS: Omit<SiteConfig, "version" | "updatedAt"> = {
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "Organización Local Más Sobresaliente" },
  },
  allies: ["Unifranz", "JCI Bolivia", "JCI Worldwide", "Cámara de Industria SC", "Fexpocruz"],
  timeline: [
    {
      year: "1915",
      title: "Nace la Junior Chamber",
      description:
        "St. Louis, Missouri. Henry Giessenbier funda lo que se convertirá en JCI Worldwide.",
    },
    {
      year: "1993",
      title: "Se funda JCI Oriente",
      description: "El capítulo Santa Cruz se establece como parte de JCI Bolivia.",
    },
    {
      year: "2018",
      title: "Expansión de programas",
      description: "Lanzamiento de Madre Emprendedora y consolidación de Emprende Oriente.",
    },
    {
      year: "2019",
      title: "100% de eficiencia",
      description: "Primera certificación nacional de eficiencia operativa.",
    },
    {
      year: "2020",
      title: "Eficiencia ratificada",
      description: "Segundo año consecutivo cumpliendo el 100% de los indicadores JCI Bolivia.",
    },
    {
      year: "2021",
      title: "Organización Local más Sobresaliente",
      description: "Reconocimiento nacional al desempeño del capítulo.",
    },
    {
      year: "Hoy",
      title: "Una nueva generación",
      description: "Más de 11 reconocimientos acumulados y proyectos vigentes en cinco frentes.",
    },
  ],
  mvv: {
    mision:
      "Brindar oportunidades de desarrollo que empoderen a las personas jóvenes a crear cambios positivos en el Oriente boliviano.",
    vision:
      "Ser la organización referente de jóvenes líderes activos en Santa Cruz, reconocida por su impacto, ética y red global.",
    valores:
      "Liderazgo con propósito · Servicio · Hermandad internacional · Empresa libre · Fe en Dios · Dignidad humana.",
  },
  reasons: [
    {
      number: "01",
      title: "Una red que abre puertas",
      body: "Acceso directo a 200.000+ miembros activos en 100+ países. Conferencias regionales, mundiales y oportunidades de movilidad real.",
    },
    {
      number: "02",
      title: "Proyectos con impacto medible",
      body: "No reuniones que no van a ningún lado: programas estructurados con cohortes, indicadores y resultados publicados al cierre de año.",
    },
    {
      number: "03",
      title: "Liderazgo en práctica",
      body: "Mentoría 1:1, posiciones de comité que se renuevan cada año, oratoria y formación financiada por la red JCI.",
    },
  ],
  contact: {
    email: "jci.orienteolm@gmail.com",
    location: "Santa Cruz de la Sierra, Bolivia",
    meetingSchedule: "Cada miércoles · 19:30 hrs",
    links: [
      { label: "JCI Worldwide ↗", url: "https://jci.cc" },
      { label: "JCI Bolivia ↗", url: "#" },
      { label: "JCI Americas ↗", url: "#" },
    ],
  },
};

export const FOUNDING_YEAR = 1993;

export function currentYearsActive(now = new Date()): number {
  return now.getFullYear() - FOUNDING_YEAR;
}
