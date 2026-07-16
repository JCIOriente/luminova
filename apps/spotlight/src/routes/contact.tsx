import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Button,
  RippleBackground,
  Reveal,
  Icon,
  Input,
  Textarea,
  Select,
  Field,
  Toast,
} from "@luminova/ui";
import { LEAD_INTENTS, leadSchema, type LeadIntent } from "@luminova/types";
import { useSiteConfig } from "../site-config/use-site-config";
import { safeHref } from "../site-config/safe-href";
import { submitLead } from "../leads/submit-lead";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

interface FormState {
  name: string;
  email: string;
  phone: string;
  intent: LeadIntent;
  message: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;
type SubmitStatus = "idle" | "submitting" | "error";

// Higher-intent labels than the bare enum value; the value sent to Firestore is
// the LeadIntent (firestore.rules pins these exact strings).
const INTENT_LABELS: Record<LeadIntent, string> = {
  Membresía: "Quiero ser miembro",
  Alianza: "Propuesta de alianza",
  Prensa: "Prensa / comunicación",
  Otro: "Otro",
};

const LABEL_META = {
  color: "var(--ink-3)",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  fontWeight: 600,
};

const EMPTY_FORM: FormState = { name: "", email: "", phone: "", intent: "Membresía", message: "" };

function ContactForm({ onSuccess }: { onSuccess: () => void }) {
  const config = useSiteConfig();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  // Honeypot: a hidden field no human fills. A bot that auto-fills it gets a
  // silent success with no write. Not a substitute for App Check (see the leads
  // rule) — just cheap first-line noise reduction.
  const [botTrap, setBotTrap] = useState("");

  function update(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (status === "error") setStatus("idle");
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const parsed = leadSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
        phone: fieldErrors.phone?.[0],
        message: fieldErrors.message?.[0],
      });
      return;
    }
    if (botTrap) {
      setForm(EMPTY_FORM);
      onSuccess();
      return;
    }
    setStatus("submitting");
    try {
      await submitLead(parsed.data);
      setForm(EMPTY_FORM);
      setStatus("idle");
      onSuccess();
    } catch (err) {
      console.error("No se pudo enviar el mensaje de contacto", err);
      setStatus("error");
    }
  }

  const submitting = status === "submitting";

  return (
    <form className="contact-card" onSubmit={submit} noValidate aria-describedby="form-help">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="ct-name" required error={errors.name}>
          <Input
            id="ct-name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "ct-name-err" : undefined}
          />
        </Field>
        <Field label="Email" htmlFor="ct-email" required error={errors.email}>
          <Input
            id="ct-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "ct-email-err" : undefined}
          />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field
          label="WhatsApp (opcional)"
          htmlFor="ct-phone"
          hint="Para contactarte más rápido por WhatsApp."
          error={errors.phone}
        >
          <Input
            id="ct-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "ct-phone-err" : undefined}
            placeholder="70000000"
          />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="¿Qué te trae por aquí?" htmlFor="ct-intent" required>
          <Select
            id="ct-intent"
            value={form.intent}
            onChange={(e) => update("intent", e.target.value)}
          >
            {LEAD_INTENTS.map((value) => (
              <option key={value} value={value}>
                {INTENT_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Mensaje" htmlFor="ct-message" required error={errors.message}>
          <Textarea
            id="ct-message"
            rows={5}
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "ct-message-err" : undefined}
            placeholder="Cuéntanos brevemente qué te interesa."
          />
        </Field>
      </div>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
        <label htmlFor="ct-company">No llenar</label>
        <Input
          id="ct-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={botTrap}
          onChange={(e) => setBotTrap(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 24 }}>
        <Button
          as="button"
          type="submit"
          variant="primary"
          disabled={submitting}
          iconRight={<Icon.arrowRight />}
        >
          {submitting ? "Enviando…" : "Enviar mensaje"}
        </Button>
      </div>
      {status === "error" ? (
        <p
          role="alert"
          style={{ marginTop: 14, marginBottom: 0, fontSize: 13, color: "var(--danger)" }}
        >
          No pudimos enviar tu mensaje. Vuelve a intentarlo o escríbenos a{" "}
          <a href={`mailto:${config.contact.email}`} style={{ textDecoration: "underline" }}>
            {config.contact.email}
          </a>
          .
        </p>
      ) : null}
      <p
        id="form-help"
        style={{ marginTop: 18, marginBottom: 0, fontSize: 13, color: "var(--ink-3)" }}
      >
        Te responderemos desde{" "}
        <a
          href={`mailto:${config.contact.email}`}
          style={{ color: "var(--jci-navy)", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {config.contact.email}
        </a>{" "}
        en un plazo máximo de 48 horas hábiles.
      </p>
    </form>
  );
}

function ChannelCTAs() {
  const config = useSiteConfig();
  const whatsappHref = safeHref(config.contact.whatsapp);
  const channelHref = safeHref(config.contact.broadcastChannel);
  if (whatsappHref === "#" && channelHref === "#") return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
      {whatsappHref !== "#" ? (
        <Button
          as="a"
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          iconLeft={<Icon.whatsapp />}
        >
          Escríbenos por WhatsApp
        </Button>
      ) : null}
      {channelHref !== "#" ? (
        <Button
          as="a"
          href={channelHref}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          iconLeft={<Icon.megaphone />}
        >
          Únete a Difusión Oriente
        </Button>
      ) : null}
    </div>
  );
}

function ContactHero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: "clamp(120px, 22vw, 160px)",
        paddingBottom: 32,
      }}
    >
      <RippleBackground variant="subtle" opacity={0.06} />
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

function ContactBody({ onSuccess }: { onSuccess: () => void }) {
  const config = useSiteConfig();
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="container">
        <div className="contact-grid">
          <Reveal>
            <div>
              <ChannelCTAs />
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
                Visítanos
              </h2>
              <div style={{ marginTop: 8 }}>
                <div className="contact-row">
                  <span className="ico">
                    <Icon.phone />
                  </span>
                  <div>
                    <div className="text-ui-xs" style={LABEL_META}>
                      Reuniones
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>
                      {config.contact.meetingSchedule}
                    </div>
                    <div className="text-ui-sm" style={{ color: "var(--ink-3)", marginTop: 2 }}>
                      Bajo confirmación previa con el comité.
                    </div>
                  </div>
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
                  <li>· Medios de comunicación cubriendo nuestros proyectos.</li>
                </ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ContactForm onSuccess={onSuccess} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactMap() {
  const config = useSiteConfig();
  const mapHref = safeHref(config.contact.mapUrl);
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
            height: "clamp(240px, 50vw, 360px)",
          }}
        >
          <svg
            viewBox="0 0 1200 360"
            preserveAspectRatio="xMidYMid slice"
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
            <rect width="1200" height="360" style={{ fill: "var(--surface-3)" }} />
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
              <circle cx="0" cy="0" r="10" style={{ fill: "var(--color-jci-blue)" }} />
              <circle cx="0" cy="0" r="4" style={{ fill: "var(--jci-white)" }} />
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
            <div style={{ marginTop: 6 }}>{config.contact.location}</div>
          </div>
          {mapHref !== "#" ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir la sede en Google Maps"
              style={{
                position: "absolute",
                right: 24,
                bottom: 24,
                background: "var(--jci-blue)",
                color: "var(--jci-white)",
                padding: "10px 16px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Abrir en Google Maps ↗
            </a>
          ) : null}
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
        onSuccess={() => {
          setToast("¡Mensaje enviado! Te contactaremos muy pronto.");
          setTimeout(() => setToast(null), 4000);
        }}
      />
      <ContactMap />
      {toast && <Toast message={toast} icon={<Icon.check />} />}
    </>
  );
}
