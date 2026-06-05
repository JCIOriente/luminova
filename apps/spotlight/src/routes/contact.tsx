import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PillButton } from "../components/pill-button";
import { RippleBackground } from "../components/ripple";
import { Reveal } from "../components/reveal";
import { Icon } from "../components/icons";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const ERROR_STYLE = { fontSize: 13, color: "#C0392B" };
const LABEL_META = {
  fontSize: 12,
  color: "var(--ink-3)",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
};

function ContactForm({ onSubmit }: { onSubmit: () => void }) {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    subject: "Membresía",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  function update(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Ingresa tu nombre.";
    if (!form.email.trim()) e.email = "Ingresa tu email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email no válido.";
    if (!form.message.trim()) e.message = "Cuéntanos qué te trae por aquí.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (validate()) {
      onSubmit();
      setForm({ name: "", email: "", subject: "Membresía", message: "" });
    }
  }

  return (
    <form className="contact-card" onSubmit={submit} noValidate aria-describedby="form-help">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label htmlFor="ct-name">
            Nombre <span className="req">*</span>
          </label>
          <input
            id="ct-name"
            className="input"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "ct-name-err" : undefined}
          />
          {errors.name && (
            <div id="ct-name-err" role="alert" style={ERROR_STYLE}>
              {errors.name}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="ct-email">
            Email <span className="req">*</span>
          </label>
          <input
            id="ct-email"
            className="input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "ct-email-err" : undefined}
          />
          {errors.email && (
            <div id="ct-email-err" role="alert" style={ERROR_STYLE}>
              {errors.email}
            </div>
          )}
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="ct-subject">
          Asunto <span className="req">*</span>
        </label>
        <select
          id="ct-subject"
          className="select"
          value={form.subject}
          onChange={(e) => update("subject", e.target.value)}
        >
          <option>Membresía</option>
          <option>Alianza institucional</option>
          <option>Prensa / Comunicación</option>
          <option>Otro</option>
        </select>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="ct-message">
          Mensaje <span className="req">*</span>
        </label>
        <textarea
          id="ct-message"
          className="textarea"
          rows={5}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "ct-message-err" : undefined}
          placeholder="Cuéntanos brevemente qué te interesa."
        />
        {errors.message && (
          <div id="ct-message-err" role="alert" style={ERROR_STYLE}>
            {errors.message}
          </div>
        )}
      </div>
      <div style={{ marginTop: 24 }}>
        <PillButton as="button" type="submit" variant="primary" iconRight={<Icon.arrowRight />}>
          Enviar mensaje
        </PillButton>
      </div>
      <p
        id="form-help"
        style={{ marginTop: 18, marginBottom: 0, fontSize: 13, color: "var(--ink-3)" }}
      >
        Te responderemos desde{" "}
        <a
          href="mailto:jci.orienteolm@gmail.com"
          style={{ color: "var(--jci-navy)", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          jci.orienteolm@gmail.com
        </a>{" "}
        en un plazo máximo de 48 horas hábiles.
      </p>
    </form>
  );
}

function ContactHero() {
  return (
    <section
      style={{ position: "relative", overflow: "hidden", paddingTop: 160, paddingBottom: 32 }}
    >
      <RippleBackground variant="subtle" color="#0097D7" opacity={0.06} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="eyebrow">Contacto</div>
        <h1 className="t-display" style={{ marginTop: 18, marginBottom: 0, maxWidth: 900 }}>
          Hablemos.
        </h1>
        <p className="t-subtitle" style={{ marginTop: 22, maxWidth: 620, color: "var(--ink-2)" }}>
          Si quieres unirte como miembro, proponer una alianza, cubrir un proyecto como prensa — o
          simplemente entender cómo trabajamos — este es el lugar.
        </p>
      </div>
    </section>
  );
}

function ContactBody({ onSubmit }: { onSubmit: () => void }) {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="container">
        <div className="contact-grid">
          <Reveal>
            <div>
              <h2
                className="t-h4"
                style={{
                  margin: 0,
                  fontSize: 14,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                Canales directos
              </h2>
              <div style={{ marginTop: 8 }}>
                <div className="contact-row">
                  <span className="ico">
                    <Icon.mail />
                  </span>
                  <div>
                    <div style={LABEL_META}>Email</div>
                    <a
                      href="mailto:jci.orienteolm@gmail.com"
                      style={{ fontSize: 16, fontWeight: 500 }}
                    >
                      jci.orienteolm@gmail.com
                    </a>
                  </div>
                </div>
                <div className="contact-row">
                  <span className="ico">
                    <Icon.pin />
                  </span>
                  <div>
                    <div style={LABEL_META}>Sede</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>
                      Santa Cruz de la Sierra, Bolivia
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                      Dirección física por confirmar
                    </div>
                  </div>
                </div>
                <div className="contact-row">
                  <span className="ico">
                    <Icon.phone />
                  </span>
                  <div>
                    <div style={LABEL_META}>Reuniones</div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>Cada miércoles · 19:30 hrs</div>
                    <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                      Bajo confirmación previa con el comité.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 36 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    marginBottom: 14,
                  }}
                >
                  Redes sociales
                </div>
                <div className="social-row">
                  <a href="#" aria-label="Facebook">
                    <Icon.facebook />
                  </a>
                  <a href="#" aria-label="Instagram">
                    <Icon.instagram />
                  </a>
                  <a href="#" aria-label="TikTok">
                    <Icon.tiktok />
                  </a>
                </div>
              </div>

              <div
                style={{
                  marginTop: 40,
                  padding: 24,
                  background: "var(--surface-2)",
                  borderRadius: 12,
                  borderLeft: "3px solid var(--jci-blue)",
                }}
              >
                <div className="t-label" style={{ color: "var(--jci-blue)" }}>
                  ¿Quién debería escribirnos?
                </div>
                <ul
                  style={{
                    margin: "14px 0 0",
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    fontSize: 14,
                    color: "var(--ink-2)",
                    lineHeight: 1.5,
                  }}
                >
                  <li>· Personas de 18 a 40 años que buscan unirse al capítulo.</li>
                  <li>· Empresas e instituciones interesadas en una alianza.</li>
                  <li>· Medios de comunicación cubriendo nuestros programas.</li>
                </ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ContactForm onSubmit={onSubmit} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactMap() {
  return (
    <section style={{ paddingBottom: 80 }}>
      <div className="container">
        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid var(--line)",
            position: "relative",
            background: "var(--surface-2)",
            height: 360,
          }}
        >
          <svg
            viewBox="0 0 1200 360"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <defs>
              <pattern id="map-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="rgba(19,15,45,0.08)"
                  strokeWidth="1"
                />
              </pattern>
              <pattern id="map-grid-2" width="180" height="180" patternUnits="userSpaceOnUse">
                <path
                  d="M 180 0 L 0 0 0 180"
                  fill="none"
                  stroke="rgba(19,15,45,0.14)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="1200" height="360" fill="#EEF2F6" />
            <rect width="1200" height="360" fill="url(#map-grid)" />
            <rect width="1200" height="360" fill="url(#map-grid-2)" />
            <path
              d="M 0 200 Q 300 140 600 200 T 1200 220"
              stroke="rgba(19,15,45,0.22)"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M 0 90 Q 400 80 700 130 T 1200 110"
              stroke="rgba(19,15,45,0.15)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M 0 290 Q 500 270 800 280 T 1200 295"
              stroke="rgba(19,15,45,0.15)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M 400 0 Q 420 150 540 360"
              stroke="rgba(19,15,45,0.12)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M 880 0 Q 860 180 920 360"
              stroke="rgba(19,15,45,0.12)"
              strokeWidth="1.5"
              fill="none"
            />
            <g transform="translate(600 180)">
              <circle cx="0" cy="0" r="44" fill="rgba(0,151,215,0.14)" />
              <circle cx="0" cy="0" r="24" fill="rgba(0,151,215,0.28)" />
              <circle cx="0" cy="0" r="10" fill="#0097D7" />
              <circle cx="0" cy="0" r="4" fill="#fff" />
            </g>
          </svg>
          <div
            style={{
              position: "absolute",
              left: 24,
              top: 24,
              background: "rgba(255,255,255,0.92)",
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--line)",
            }}
          >
            <div className="t-label" style={{ color: "var(--jci-blue)" }}>
              Sede
            </div>
            <div style={{ marginTop: 6 }}>Santa Cruz de la Sierra · Bolivia</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <ContactHero />
      <ContactBody
        onSubmit={() => {
          setToast("Mensaje enviado. Te responderemos a la brevedad.");
          setTimeout(() => setToast(null), 4000);
        }}
      />
      <ContactMap />
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span style={{ color: "var(--jci-teal)", display: "inline-flex" }}>
            <Icon.check />
          </span>
          {toast}
        </div>
      )}
    </>
  );
}
