import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, RippleBackground, SectionHeader, Reveal, Icon, cn } from "@luminova/ui";
import { CEL_POSITION_TITLES, currentTermKey } from "@luminova/types";
import type { BoardShowcaseItem } from "@luminova/types/engine";
import { TimelineItem } from "../components/cards";
import { useSiteConfig } from "../site-config/use-site-config";
import { currentYearsActive } from "../site-config/defaults";
import { useBoardOnVisible } from "../board/use-board";

export const Route = createFileRoute("/about")({
  component: About,
});

const MVV_PRESENTATION = [
  { variant: "var-blue", icon: <Icon.target />, title: "Misión", field: "mision" as const },
  { variant: "", icon: <Icon.compass />, title: "Visión", field: "vision" as const },
  { variant: "var-navy", icon: <Icon.spark />, title: "Valores", field: "valores" as const },
];

function AboutHero() {
  return (
    <section
      className="bg-blue"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: "clamp(130px, 24vw, 180px)",
        paddingBottom: 110,
        minHeight: "56vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      <RippleBackground variant="hero-corner-tl" color="var(--color-jci-white)" opacity={0.08} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="eyebrow no-rule" style={{ color: "var(--color-on-dark-2)" }}>
          Quiénes Somos
        </div>
        <h1
          className="t-display"
          style={{ color: "var(--jci-white)", marginTop: 22, marginBottom: 0, maxWidth: 1000 }}
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
              <div className={cn("mvv-card", it.variant)}>
                <div className="accent">{it.icon}</div>
                <h3 className="t-h4" style={{ margin: 0 }}>
                  {it.title}
                </h3>
                <p
                  className="text-ui-lg"
                  style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6 }}
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
        <SectionHeader eyebrow="Hitos" title={`${currentYearsActive()} años de huella.`} />
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

const CLOSING_NOTE = "Directiva completa — próximamente.";

function Portrait({
  item,
  className,
  tintTeal,
}: {
  item: BoardShowcaseItem;
  className?: string;
  tintTeal?: boolean;
}) {
  return (
    <div className={cn("portrait", tintTeal && "tint-teal", className)}>
      <img
        className="pic"
        src={item.portraitUrl}
        alt={`Retrato — ${item.name}`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function DirectivaHero({
  year,
  president,
  note,
}: {
  year: string;
  president: BoardShowcaseItem | null;
  note: boolean;
}) {
  return (
    <div className="dir-hero">
      <RippleBackground variant="hero-corner-tl" color="var(--color-jci-white)" opacity={0.06} />
      <div className="ghost-year t-num" aria-hidden>
        {year}
      </div>
      <div className="container inner">
        <Reveal>
          <div className="eyebrow">La Directiva</div>
          <h2 className="t-title" style={{ marginTop: 20 }}>
            Las personas que dirigen la gestión.
          </h2>
          <p className="lede">
            Un comité ejecutivo y un cuerpo de direcciones elegidos para servir al Oriente boliviano
            durante {year}.
          </p>
        </Reveal>
        {president && (
          <Reveal delay={120}>
            <div className="pres-spread">
              <div className="pres-portrait-frame">
                <Portrait item={president} className="pres-portrait" />
              </div>
              <div className="pres-meta">
                <div className="rank t-num">01</div>
                <div className="role">
                  {president.title} · Gestión {year}
                </div>
                <h3 className="name">{president.name}</h3>
                <blockquote className="mandate">
                  “El servicio a la humanidad es la mejor obra de una vida.”
                  <cite>Credo JCI</cite>
                </blockquote>
              </div>
            </div>
          </Reveal>
        )}
        {note && <div className="closing-note">{CLOSING_NOTE}</div>}
      </div>
    </div>
  );
}

function DirectivaLedger({
  year,
  celCount,
  members,
  startNum,
  note,
}: {
  year: string;
  celCount: number;
  members: BoardShowcaseItem[];
  startNum: number;
  note: boolean;
}) {
  return (
    <div className="cel-band">
      <div className="container">
        <div className="cel-head">
          <div className="eyebrow">Comité Ejecutivo</div>
          <div className="meta">
            {celCount} {celCount === 1 ? "cargo" : "cargos"} · Gestión {year}
          </div>
        </div>
        <div className="ledger">
          {members.map((m, i) => {
            const num = String(startNum + i).padStart(2, "0");
            return (
              <Reveal key={m.id} delay={i * 60}>
                <div className="ledger-row">
                  <div className="rank t-num">{num}</div>
                  <Portrait item={m} tintTeal={i % 2 === 1} />
                  <div className="who">
                    <span className="role-label" data-rank={num}>
                      {m.title}
                    </span>
                    <div className="name">{m.name}</div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
        {note && <div className="closing-note">{CLOSING_NOTE}</div>}
      </div>
    </div>
  );
}

function DirectivaDirecciones({ members, note }: { members: BoardShowcaseItem[]; note: boolean }) {
  return (
    <div className="jdl-band">
      <div className="container">
        <div style={{ textAlign: "center" }}>
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            Direcciones
          </div>
          <p className="sub" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Las áreas que convierten el plan de la gestión en proyectos reales.
          </p>
        </div>
        <div className="jdl-strip">
          {members.map((m, i) => (
            <Reveal key={m.id} delay={i * 80}>
              <div className="jdl-chip">
                <Portrait item={m} tintTeal />
                <span className="role-label">{m.title}</span>
                <div className="name">{m.name}</div>
              </div>
            </Reveal>
          ))}
        </div>
        {note && <div className="closing-note">{CLOSING_NOTE}</div>}
      </div>
    </div>
  );
}

function AboutDirectiva() {
  const { ref, data: board, loading, error } = useBoardOnVisible();
  const ready = !loading && !error && board.length > 0;
  // Until the board loads (or when nobody is published) render a zero-height sentinel
  // that still carries the on-visible ref, so the page never leaves an empty gap.
  if (!ready) return <div ref={ref} aria-hidden style={{ height: 1 }} />;

  const year = currentTermKey();
  const cel = board.filter((m) => m.group === "CEL");
  const jdl = board.filter((m) => m.group === "JDL");
  const president = cel.find((m) => m.rank === 0) ?? null;
  const celRest = cel.filter((m) => m !== president);
  // Partial while fewer CEL cargos are published than the statutory count → invite
  // "próximamente" once, on whichever band renders last (decided here, in one place).
  const partial = cel.length < CEL_POSITION_TITLES.length;
  const lastBand = jdl.length > 0 ? "jdl" : celRest.length > 0 ? "cel" : "hero";
  const startNum = president ? 2 : 1;

  return (
    <section ref={ref} className="directiva">
      <DirectivaHero year={year} president={president} note={partial && lastBand === "hero"} />
      {celRest.length > 0 && (
        <DirectivaLedger
          year={year}
          celCount={cel.length}
          members={celRest}
          startNum={startNum}
          note={partial && lastBand === "cel"}
        />
      )}
      {jdl.length > 0 && (
        <DirectivaDirecciones members={jdl} note={partial && lastBand === "jdl"} />
      )}
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
                  className="text-ui-lg"
                  style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6 }}
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
      <AboutDirectiva />
      <AboutWhyJoin />
    </>
  );
}
