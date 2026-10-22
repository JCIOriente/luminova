import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  name,
  locality,
  foundedYear,
  movementName,
  parentOrganization,
  stats as brandStats,
} from "virtual:luminova-brand";
import { Button, ArrowLink, RippleBackground, SectionHeader, Reveal, Icon } from "@luminova/ui";
import { AreaCard, ImpactStat } from "../components/cards";
import HomePrograms from "../components/home-programs";

import { VisibilitySentinel } from "../components/visibility-sentinel";
import { useSiteConfig } from "../site-config/use-site-config";
import { currentYearsActive } from "../site-config/defaults";
import { useAlliesOnVisible } from "../allies/use-allies";
import { useFeaturedListOnVisible } from "../showcase/use-showcase";
import { ALLY_CATEGORY_LABELS } from "@luminova/types/engine";
import { decadesPhrase, withPreposition, withoutArticle } from "../lib/place-phrase";

const PROJECTS_SECTION_ID = "proyectos";

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
    desc: "Liderazgo, oratoria y habilidades de gestión que se aprenden haciendo, junto a otros miembros.",
    icon: <Icon.user />,
  },
  {
    num: "02",
    title: "Desarrollo Comunitario",
    desc: `Proyectos que abordan problemas reales ${withPreposition("de", locality.region)}, de la educación al medio ambiente.`,
    icon: <Icon.heart />,
  },
  {
    num: "03",
    title: "Cooperación Internacional",
    desc: `Conferencias, intercambios y representación en ${parentOrganization.name}, JCI Americas y JCI Worldwide.`,
    icon: <Icon.globe />,
  },
  {
    num: "04",
    title: "Negocios y Emprendimiento",
    desc: "Formación y contactos para emprendedores y profesionales que quieren hacer crecer sus negocios y carreras.",
    icon: <Icon.briefcase />,
  },
];

function HomeHero() {
  const config = useSiteConfig();
  const navigate = useNavigate();
  return (
    <section
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: "clamp(110px, 20vw, 140px)",
        paddingBottom: "clamp(64px, 14vw, 100px)",
        minHeight: "92vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      <RippleBackground variant="hero" />
      <div className="container" style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ maxWidth: 920 }}>
          <h1
            className="t-display"
            style={{ marginTop: 0, marginBottom: 0, color: "var(--jci-white)" }}
          >
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
            style={{ marginTop: 24, maxWidth: 620, color: "var(--color-on-dark-2)" }}
          >
            {`Capítulo ${locality.city} de la ${movementName}. Formamos líderes con propósito desde ${foundedYear}.`}
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
              Conoce {name}
            </Button>
            <Button
              variant="secondary"
              onDark
              iconRight={<Icon.arrowRight />}
              onClick={(e) => {
                e.preventDefault();
                if (document.getElementById(PROJECTS_SECTION_ID)) scrollToId(PROJECTS_SECTION_ID);
                else void navigate({ to: "/impacto" });
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
              <div className="l">{`años desarrollando líderes en ${locality.regionShort}`}</div>
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
            <div className="eyebrow">{`JCI Worldwide × ${withoutArticle(locality.regionShort)}`}</div>
            <h2 className="t-title" style={{ marginTop: 20, marginBottom: 0 }}>
              Una red global con raíces locales.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="prose">
              <p className="t-body" style={{ marginTop: 0 }}>
                {`${name} es el capítulo de ${locality.city} de la ${movementName}, una organización fundada en 1915 que hoy reúne a jóvenes profesionales y emprendedores en más de cien países. Aquí canalizamos esa red mundial hacia el impacto local.`}
              </p>
              <p className="t-body" style={{ color: "var(--ink-2)" }}>
                Formamos líderes activos. Creamos proyectos que mejoran la comunidad. Conectamos a
                personas de 18 a 40 años con oportunidades de crecimiento personal, profesional e
                internacional.
              </p>
              <figure className="pullquote" style={{ marginTop: 36, marginBottom: 0 }}>
                <blockquote className="t-quote" style={{ margin: 0 }}>
                  {`${config.stats.membersWorldwide} miembros en ${config.stats.countries} países y ${brandStats.nationalOrganizations} organizaciones en ${locality.country}. En ${locality.city}, ${name} aporta a esa red desde ${foundedYear}.`}
                </blockquote>
                <cite>JCI en cifras</cite>
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
          subtitle="Cada miembro elige dónde participar según sus intereses y puede sumarse a más de un área."
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

function HomeProjects() {
  const navigate = useNavigate();
  const { ref, data: featured, loading, error } = useFeaturedListOnVisible();
  const ready = !loading && !error && featured.length > 0;
  if (!ready) return <VisibilitySentinel ref={ref} />;
  return (
    <section ref={ref} id={PROJECTS_SECTION_ID} className="section">
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
          <HomePrograms items={featured} />
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
          <div className="eyebrow" style={{ color: "var(--color-on-dark-2)" }}>
            Trayectoria
          </div>
          <h2
            className="t-title"
            style={{ color: "var(--jci-white)", marginTop: 20, marginBottom: 0 }}
          >
            {`Más de ${decadesPhrase(currentYearsActive())} sirviendo ${withPreposition("a", locality.regionShort)}.`}
          </h2>
        </div>
        <div className="impact-grid" style={{ marginTop: 72 }}>
          <ImpactStat
            value={`+${currentYearsActive()}`}
            label={`años activos en ${locality.city} desde ${foundedYear}`}
          />
          <ImpactStat
            value={config.stats.standoutOrg.year}
            label={`${config.stats.standoutOrg.title} de ${parentOrganization.name}`}
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
  if (!ready) return <VisibilitySentinel ref={ref} />;
  return (
    <section ref={ref} className="section">
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
    </section>
  );
}

function HomeCTA() {
  const navigate = useNavigate();
  return (
    <section
      className="bg-dark"
      style={{ position: "relative", overflow: "hidden", padding: "clamp(72px, 14vw, 120px) 0" }}
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
            color: "var(--jci-white)",
            marginTop: 18,
            marginBottom: 0,
            maxWidth: 820,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Crece como líder y sirve a tu comunidad.
        </h2>
        <p
          className="t-subtitle"
          style={{
            marginTop: 22,
            color: "var(--color-on-dark-2)",
            maxWidth: 620,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Escríbenos, conoce al equipo y descubre cómo sumarte a nuestros proyectos.
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
            Conoce {name}
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
      <HomeProjects />
      <HomeImpact />
      <HomeAllies />
      <HomeCTA />
    </>
  );
}
