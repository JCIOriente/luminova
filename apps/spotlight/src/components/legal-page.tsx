import type { ReactNode } from "react";
import { RippleBackground, Reveal } from "@luminova/ui";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro: string;
  updatedLabel: string;
  sections: LegalSection[];
}

export function LegalPage({ eyebrow, title, intro, updatedLabel, sections }: LegalPageProps) {
  return (
    <>
      <section
        style={{ position: "relative", overflow: "hidden", paddingTop: 160, paddingBottom: 24 }}
      >
        <RippleBackground variant="subtle" color="#0097D7" opacity={0.06} />
        <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: 760 }}>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="t-display" style={{ marginTop: 18, marginBottom: 0 }}>
            {title}
          </h1>
          <p className="t-subtitle" style={{ marginTop: 22, color: "var(--ink-2)" }}>
            {intro}
          </p>
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-3)" }}>{updatedLabel}</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 32 }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="prose" style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {sections.map((s, i) => (
              <Reveal key={s.heading} delay={i * 60}>
                <div>
                  <h2 className="t-title" style={{ fontSize: 22, marginTop: 0, marginBottom: 12 }}>
                    {s.heading}
                  </h2>
                  <div className="t-body" style={{ color: "var(--ink-2)", lineHeight: 1.65 }}>
                    {s.body}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
