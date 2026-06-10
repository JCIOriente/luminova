import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, ArrowLink, RippleBackground, SectionHeader, Reveal, Icon } from "@luminova/ui";
import { AreaCard, ProgramCard, ImpactStat } from "../components/cards";

export const Route = createFileRoute("/")({
  component: Home,
});

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

const AREAS = [
  {
    num: "01",
    title: "Desarrollo Individual",
    desc: "Liderazgo, oratoria y habilidades de gestión. Cada miembro avanza con un plan personal y mentoría.",
    icon: <Icon.user />,
  },
  {
    num: "02",
    title: "Acción Comunitaria",
    desc: "Proyectos sostenidos que abordan problemas reales en el Oriente boliviano — desde educación hasta medio ambiente.",
    icon: <Icon.heart />,
  },
  {
    num: "03",
    title: "Cooperación Internacional",
    desc: "Conferencias, intercambios y representación en JCI Bolivia, JCI Americas y JCI Worldwide.",
    icon: <Icon.globe />,
  },
  {
    num: "04",
    title: "Negocio y Emprendimiento",
    desc: "Una comunidad de fundadores, ejecutivos y profesionales que construyen el futuro económico de la región.",
    icon: <Icon.briefcase />,
  },
];

const PROGRAMS = [
  {
    tag: "Anual · Septiembre",
    title: "World Clean Up Day",
    desc: "Movilización global de limpieza. JCI Oriente coordina la jornada en Santa Cruz cada año.",
    label: "World Clean Up Day · jornada en Equipetrol",
    tint: "teal" as const,
  },
  {
    tag: "Programa de impacto",
    title: "Madre Emprendedora",
    desc: "Capacitación y acompañamiento a mujeres jefas de hogar que inician su primer negocio.",
    label: "Madre Emprendedora · taller cohort 2024",
    tint: "blue" as const,
  },
  {
    tag: "Programa de impacto",
    title: "Emprende Oriente",
    desc: "Acelera negocios locales en etapa temprana con mentoría, comunidad y vinculación.",
    label: "Emprende Oriente · demo day",
    tint: "navy" as const,
  },
  {
    tag: "Programa social",
    title: "Transformando Vidas",
    desc: "Intervenciones puntuales en comunidades rurales del departamento.",
    label: "Transformando Vidas · brigada rural",
    tint: "blue" as const,
  },
  {
    tag: "Programa educativo",
    title: "Creando Oportunidades",
    desc: "Becas, talleres y conexiones para jóvenes universitarios del Oriente.",
    label: "Creando Oportunidades · panel UPSA",
    tint: "teal" as const,
  },
];

const ALLIES = ["Unifranz", "JCI Bolivia", "JCI Worldwide", "Cámara de Industria SC", "Fexpocruz"];

function HomeHero() {
  return (
    <section
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: 140,
        paddingBottom: 100,
        minHeight: "92vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      <RippleBackground variant="hero" color="#0097D7" />
      <div className="container" style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ maxWidth: 920 }}>
          <div className="eyebrow no-rule" style={{ color: "var(--jci-teal)", display: "flex" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Inspire.</span>
          </div>
          <h1 className="t-display" style={{ marginTop: 20, marginBottom: 0, color: "#fff" }}>
            Inspira.
          </h1>
          <p
            className="t-subtitle"
            style={{ marginTop: 16, marginBottom: 0, color: "var(--jci-teal)", fontWeight: 500 }}
          >
            A fire shared never dies.
          </p>
          <p
            className="t-subtitle"
            style={{ marginTop: 24, maxWidth: 620, color: "rgba(255,255,255,0.78)" }}
          >
            Capítulo Santa Cruz de la Cámara Junior Internacional. Desarrollando líderes con
            propósito desde 1993.
          </p>
          <div style={{ marginTop: 36, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              onDark
              onClick={(e) => {
                e.preventDefault();
                scrollToId("about-jci");
              }}
            >
              Conoce JCI Oriente
            </Button>
            <Button
              variant="secondary"
              onDark
              iconRight={<Icon.arrowRight />}
              onClick={(e) => {
                e.preventDefault();
                scrollToId("programas");
              }}
            >
              Ver nuestros programas
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 64 }}>
          <div className="mini-stats">
            <div className="mini-stat">
              <div className="v t-num">+32</div>
              <div className="l">años desarrollando líderes en el Oriente</div>
            </div>
            <div className="mini-stat">
              <div className="v t-num">5</div>
              <div className="l">programas insignia activos</div>
            </div>
            <div className="mini-stat">
              <div className="v t-num">100+</div>
              <div className="l">países en la red global JCI</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeAbout() {
  return (
    <section id="about-jci" className="section">
      <div className="container">
        <div className="grid-2" style={{ alignItems: "start" }}>
          <Reveal>
            <div className="eyebrow">JCI Worldwide × Oriente</div>
            <h2 className="t-title" style={{ marginTop: 20, marginBottom: 0 }}>
              Una red global con raíces locales.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="prose">
              <p className="t-body" style={{ marginTop: 0 }}>
                JCI Oriente es el capítulo de Santa Cruz de la Cámara Junior Internacional, una
                organización fundada en 1915 que hoy reúne a jóvenes profesionales y emprendedores
                en más de cien países. Aquí canalizamos esa red mundial hacia el impacto local.
              </p>
              <p className="t-body" style={{ color: "var(--ink-2)" }}>
                Formamos líderes activos. Creamos proyectos que mejoran la comunidad. Conectamos a
                personas de entre 18 y 40 años con oportunidades de crecimiento, internacionales y
                profundamente humanas.
              </p>
              <figure className="pullquote" style={{ marginTop: 36, marginBottom: 0 }}>
                <blockquote className="t-quote" style={{ margin: 0 }}>
                  “Más de 200.000 miembros en 100+ países, 17 organizaciones en Bolivia, 1 capítulo
                  activo en Santa Cruz.”
                </blockquote>
                <cite>Red JCI · 2025</cite>
              </figure>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function HomeAreas() {
  return (
    <section className="section bg-soft">
      <div className="container">
        <SectionHeader
          eyebrow="Áreas de oportunidad"
          title="Cuatro maneras de crecer con JCI."
          subtitle="Cada miembro elige el camino que le hace sentido. La mayoría toca los cuatro a lo largo del año."
        />
        <div className="grid-4" style={{ marginTop: 56 }}>
          {AREAS.map((it, i) => (
            <Reveal key={it.num} delay={i * 80}>
              <AreaCard number={it.num} title={it.title} description={it.desc} icon={it.icon} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomePrograms() {
  return (
    <section id="programas" className="section">
      <div className="container">
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
          }}
        >
          <SectionHeader eyebrow="Programas insignia" title="Cinco programas. Un compromiso." />
          <ArrowLink href="#">Ver todos los programas</ArrowLink>
        </div>
        <div className="program-scroller" style={{ marginTop: 56 }}>
          <div className="program-grid">
            {PROGRAMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 60}>
                <ProgramCard
                  tag={p.tag}
                  title={p.title}
                  description={p.desc}
                  slotLabel={p.label}
                  tint={p.tint}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeImpact() {
  return (
    <section className="section bg-blue" style={{ position: "relative", overflow: "hidden" }}>
      <RippleBackground variant="subtle" color="#FFFFFF" opacity={0.06} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 720 }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.75)" }}>
            Trayectoria
          </div>
          <h2 className="t-title" style={{ color: "#fff", marginTop: 20, marginBottom: 0 }}>
            Más de tres décadas de impacto medible.
          </h2>
        </div>
        <div className="impact-grid" style={{ marginTop: 72 }}>
          <ImpactStat value="+32" label="años activos en Santa Cruz desde 1993" />
          <ImpactStat value="2021" label="Organización Local Más Sobresaliente — JCI Bolivia" />
          <ImpactStat value="100%" label="eficiencia operativa certificada en 2019 y 2020" />
          <ImpactStat value="+11" label="reconocimientos nacionales acumulados" />
        </div>
      </div>
    </section>
  );
}

function HomeAllies() {
  return (
    <section className="section" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className="container">
        <div style={{ textAlign: "center" }}>
          <div className="t-label" style={{ color: "var(--ink-3)" }}>
            Confían en nosotros
          </div>
          <div className="ally-strip" style={{ marginTop: 32 }}>
            {ALLIES.map((name) => (
              <a key={name} className="ally" href="#">
                <span className="mark" aria-hidden="true" />
                {name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeCTA() {
  const navigate = useNavigate();
  return (
    <section
      className="bg-dark"
      style={{ position: "relative", overflow: "hidden", padding: "120px 0" }}
    >
      <RippleBackground variant="cta" color="#0097D7" opacity={0.07} />
      <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div
          className="eyebrow no-rule"
          style={{ color: "var(--jci-teal)", justifyContent: "center", display: "flex" }}
        >
          Únete
        </div>
        <h2
          className="t-title"
          style={{
            color: "#fff",
            marginTop: 18,
            marginBottom: 0,
            maxWidth: 820,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Conviértete en el cambio que el Oriente necesita.
        </h2>
        <p
          className="t-subtitle"
          style={{
            marginTop: 22,
            color: "rgba(255,255,255,0.78)",
            maxWidth: 620,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Postúlate, ven a una reunión, conoce al comité. Sin compromiso.
        </p>
        <div
          style={{
            marginTop: 36,
            display: "flex",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <Button
            variant="primary"
            onDark
            iconRight={<Icon.arrowRight />}
            onClick={(e) => {
              e.preventDefault();
              void navigate({ to: "/contact" });
            }}
          >
            Contáctanos
          </Button>
          <Button
            variant="secondary"
            onDark
            onClick={(e) => {
              e.preventDefault();
              void navigate({ to: "/about" });
            }}
          >
            Conoce a JCI Oriente
          </Button>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <HomeHero />
      <HomeAbout />
      <HomeAreas />
      <HomePrograms />
      <HomeImpact />
      <HomeAllies />
      <HomeCTA />
    </>
  );
}
