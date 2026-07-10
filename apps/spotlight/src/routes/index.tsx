import { lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, ArrowLink, RippleBackground, SectionHeader, Reveal, Icon } from "@luminova/ui";
import { AreaCard, ImpactStat } from "../components/cards";
import { ProgramsSkeleton } from "../components/programs-skeleton";

import { useSiteConfig } from "../site-config/use-site-config";
import { currentYearsActive } from "../site-config/defaults";
import { useAlliesOnVisible } from "../allies/use-allies";
import { ALLY_CATEGORY_LABELS } from "@luminova/types/engine";

const LazyHomePrograms = lazy(() => import("../components/home-programs"));

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

function HomeHero() {
  const config = useSiteConfig();
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
      <RippleBackground variant="hero" />
      <div className="container" style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ maxWidth: 920 }}>
          <h1 className="t-display" style={{ marginTop: 0, marginBottom: 0, color: "#fff" }}>
            {config.hero.motto}
          </h1>
          {config.hero.submotto ? (
            <p
              className="t-subtitle"
              style={{ marginTop: 16, marginBottom: 0, color: "var(--jci-teal)", fontWeight: 500 }}
            >
              {config.hero.submotto}
            </p>
          ) : null}
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
                scrollToId("proyectos");
              }}
            >
              Ver nuestros proyectos
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 64 }}>
          <div className="mini-stats">
            <div className="mini-stat">
              <div className="v t-num">+{currentYearsActive()}</div>
              <div className="l">años desarrollando líderes en el Oriente</div>
            </div>
            <div className="mini-stat">
              <div className="v t-num">{config.stats.programCount}</div>
              <div className="l">programas anuales</div>
            </div>
            <div className="mini-stat">
              <div className="v t-num">{config.stats.countries}</div>
              <div className="l">países en la red global JCI</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeAbout() {
  const config = useSiteConfig();
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
                  {`“Más de ${config.stats.membersWorldwide} miembros en ${config.stats.countries} países, 17 organizaciones en Bolivia, 1 capítulo activo en Santa Cruz.”`}
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
  const navigate = useNavigate();
  return (
    <section id="proyectos" className="section">
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
          <SectionHeader eyebrow="Proyectos destacados" title="El trabajo que nos enorgullece." />
          <ArrowLink
            href="/impacto"
            onClick={(e) => {
              e.preventDefault();
              void navigate({ to: "/impacto" });
            }}
          >
            Ver nuestro impacto
          </ArrowLink>
        </div>
        <div className="program-scroller" style={{ marginTop: 56 }}>
          <Suspense fallback={<ProgramsSkeleton />}>
            <LazyHomePrograms />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

function HomeImpact() {
  const config = useSiteConfig();
  return (
    <section className="section bg-blue" style={{ position: "relative", overflow: "hidden" }}>
      <RippleBackground variant="subtle" color="var(--color-jci-white)" opacity={0.06} />
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
          <ImpactStat
            value={`+${currentYearsActive()}`}
            label="años activos en Santa Cruz desde 1993"
          />
          <ImpactStat
            value={config.stats.standoutOrg.year}
            label={`${config.stats.standoutOrg.title} — JCI Bolivia`}
          />
          <ImpactStat
            value={`${config.stats.efficiencyPct}%`}
            label="eficiencia operativa certificada en 2019 y 2020"
          />
          <ImpactStat
            value={`+${config.stats.nationalAwards}`}
            label="reconocimientos nacionales acumulados"
          />
        </div>
      </div>
    </section>
  );
}

function HomeAllies() {
  const { ref, data: allies, loading, error } = useAlliesOnVisible();
  const ready = !loading && !error && allies.length > 0;
  return (
    <section ref={ref} className="section" style={{ paddingTop: 80, paddingBottom: 80 }}>
      {ready ? (
        <div className="container">
          <div style={{ textAlign: "center" }}>
            <div className="t-label" style={{ color: "var(--ink-3)" }}>
              Confían en nosotros
            </div>
            <div className="ally-strip" style={{ marginTop: 32 }}>
              {allies.map((ally) => (
                <figure key={ally.id} className="ally-card">
                  <img
                    className="ally-logo"
                    src={ally.logoUrl}
                    alt={ally.name}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption className="ally-name">{ally.name}</figcaption>
                  <span className="ally-chip">{ALLY_CATEGORY_LABELS[ally.category]}</span>
                </figure>
              ))}
            </div>
          </div>
        </div>
      ) : null}
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
      <RippleBackground variant="cta" opacity={0.07} />
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
          Conviértete en el cambio que quieres ver en el mundo.
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
          Postúlate, conócenos y mira el cambio que logramos — en nosotros y en nuestra comunidad.
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
