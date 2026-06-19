import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, RippleBackground, SectionHeader, Reveal, ImgSlot, Icon } from "@luminova/ui";
import { CEL_POSITIONS } from "@luminova/types";
import { TimelineItem } from "../components/cards";
import { useSiteConfig } from "../site-config/use-site-config";

export const Route = createFileRoute("/about")({
  component: About,
});

const MVV_PRESENTATION = [
  { variant: "var-blue", icon: <Icon.target />, title: "Misión", field: "mision" as const },
  { variant: "", icon: <Icon.compass />, title: "Visión", field: "vision" as const },
  { variant: "var-navy", icon: <Icon.spark />, title: "Valores", field: "valores" as const },
];

const COMITE = CEL_POSITIONS.map((p) => p.title);

function AboutHero() {
  return (
    <section
      className="bg-blue"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: 180,
        paddingBottom: 110,
        minHeight: "56vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      <RippleBackground variant="hero-corner-tl" color="#FFFFFF" opacity={0.08} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="eyebrow no-rule" style={{ color: "rgba(255,255,255,0.75)" }}>
          Quiénes Somos
        </div>
        <h1
          className="t-display"
          style={{ color: "#fff", marginTop: 22, marginBottom: 0, maxWidth: 1000 }}
        >
          Desarrollando líderes en el Oriente boliviano desde 1993.
        </h1>
      </div>
    </section>
  );
}

function AboutStory() {
  return (
    <section className="section">
      <div className="container">
        <div className="prose" style={{ marginLeft: "auto", marginRight: "auto" }}>
          <Reveal>
            <div className="eyebrow">Nuestra historia</div>
            <h2 className="t-title" style={{ marginTop: 20, marginBottom: 24 }}>
              Una idea que empezó hace más de un siglo.
            </h2>
            <p className="t-body">
              En 1915, en San Luis, Missouri, un grupo de jóvenes profesionales fundó la Junior
              Chamber con una convicción simple: la juventud no es un periodo de espera, es el
              momento de actuar. Esa idea se volvió un movimiento mundial.
            </p>
            <p className="t-body">
              En 1993, llegó a Santa Cruz. JCI Oriente nació para canalizar esa energía global hacia
              los desafíos del Oriente boliviano — y desde entonces ha formado a generaciones de
              líderes que hoy están en empresas, gobierno y sociedad civil.
            </p>
            <figure className="pullquote" style={{ margin: "48px 0" }}>
              <blockquote className="t-quote" style={{ margin: 0 }}>
                “Creemos que el servicio a la humanidad es la mejor obra de una vida.”
              </blockquote>
              <cite>Credo JCI · 1946</cite>
            </figure>
            <p className="t-body">
              Hoy somos uno de los capítulos más activos de JCI Bolivia. Estamos formados por
              personas de 18 a 40 años que combinan carreras profesionales con un compromiso real:
              dejar al Oriente mejor de lo que lo encontramos.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function AboutMVV() {
  const config = useSiteConfig();
  return (
    <section className="section bg-soft">
      <div className="container">
        <SectionHeader
          eyebrow="Lo que nos guía"
          title="Misión, visión y valores."
          subtitle="Tres marcos que deciden qué proyectos tomamos y cómo trabajamos juntos."
        />
        <div className="grid-3" style={{ marginTop: 56 }}>
          {MVV_PRESENTATION.map((it, i) => (
            <Reveal key={it.title} delay={i * 80}>
              <div className={`mvv-card ${it.variant}`}>
                <div className="accent">{it.icon}</div>
                <h3 className="t-h4" style={{ margin: 0 }}>
                  {it.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--ink-2)",
                    fontSize: 15.5,
                    lineHeight: 1.6,
                  }}
                >
                  {config.mvv[it.field]}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutTimeline() {
  const config = useSiteConfig();
  return (
    <section className="section">
      <div className="container">
        <SectionHeader eyebrow="Hitos" title="32 años de huella." />
        <div className="timeline" style={{ marginTop: 56, maxWidth: 760 }}>
          {config.timeline.map((it, i) => (
            <Reveal key={it.year + it.title} delay={i * 40}>
              <TimelineItem year={it.year} title={it.title} description={it.description} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutComite() {
  return (
    <section className="section bg-soft">
      <div className="container">
        <SectionHeader
          eyebrow="Comité Ejecutivo"
          title="El equipo que dirige el año en curso."
          subtitle="Las personas detrás de cada programa y cada decisión. Próximamente con perfiles completos."
        />
        <div className="grid-4" style={{ marginTop: 56 }}>
          {COMITE.map((role, i) => (
            <Reveal key={role} delay={i * 60}>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <ImgSlot
                  label={`retrato · ${role.toLowerCase()}`}
                  tint={i % 2 ? "teal" : "blue"}
                  aspect="1/1"
                  style={{ borderRadius: 0, border: 0 }}
                />
                <div style={{ padding: 22 }}>
                  <div className="t-label" style={{ color: "var(--jci-blue)" }}>
                    {role}
                  </div>
                  <div className="t-h4" style={{ marginTop: 10 }}>
                    Nombre Apellido
                  </div>
                  <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 6 }}>
                    Próximamente
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutWhyJoin() {
  const config = useSiteConfig();
  const navigate = useNavigate();
  return (
    <section className="section">
      <div className="container">
        <SectionHeader
          eyebrow="Por qué unirte"
          title="Tres razones honestas."
          subtitle="No te vamos a vender un sueño: te contamos exactamente lo que cambia cuando entras."
        />
        <div className="grid-3" style={{ marginTop: 56 }}>
          {config.reasons.map((r, i) => (
            <Reveal key={r.number} delay={i * 80}>
              <article className="reason-card">
                <div className="num">{r.number}</div>
                <h3 className="t-h4" style={{ margin: 0 }}>
                  {r.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--ink-2)",
                    fontSize: 15.5,
                    lineHeight: 1.6,
                  }}
                >
                  {r.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
        <div style={{ marginTop: 64, display: "flex", justifyContent: "center" }}>
          <Button
            variant="primary"
            iconRight={<Icon.arrowRight />}
            onClick={(e) => {
              e.preventDefault();
              void navigate({ to: "/contact" });
            }}
          >
            Únete a JCI Oriente
          </Button>
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <>
      <AboutHero />
      <AboutStory />
      <AboutMVV />
      <AboutTimeline />
      <AboutComite />
      <AboutWhyJoin />
    </>
  );
}
