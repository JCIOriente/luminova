import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Icon, LogoLockup, RippleBackground } from "@luminova/ui";
import type { LinktreeIcon, LinktreeSocialPlatform } from "@luminova/types";
import { useSiteConfig } from "../site-config/use-site-config";
import { safeHref } from "../site-config/safe-href";

export const Route = createFileRoute("/enlaces")({
  component: EnlacesPage,
});

const LINK_ICON: Record<LinktreeIcon, (p: { s?: number }) => ReactNode> = {
  user: Icon.user,
  globe: Icon.globe,
  folder: Icon.folder,
  calendar: Icon.calendar,
  mail: Icon.mail,
  megaphone: Icon.megaphone,
  handshake: Icon.handshake,
  heart: Icon.heart,
  target: Icon.target,
  compass: Icon.compass,
  briefcase: Icon.briefcase,
  spark: Icon.spark,
  linkedin: Icon.linkedin,
  whatsapp: Icon.whatsapp,
  youtube: Icon.youtube,
};

const SOCIAL: Record<
  LinktreeSocialPlatform,
  { label: string; icon: (p: { s?: number }) => ReactNode }
> = {
  instagram: { label: "Instagram", icon: Icon.instagram },
  facebook: { label: "Facebook", icon: Icon.facebook },
  tiktok: { label: "TikTok", icon: Icon.tiktok },
  linkedin: { label: "LinkedIn", icon: Icon.linkedin },
  whatsapp: { label: "WhatsApp", icon: Icon.whatsapp },
  youtube: { label: "YouTube", icon: Icon.youtube },
};

const cardBase: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "44px 1fr 22px",
  alignItems: "center",
  gap: 14,
  padding: "17px 20px",
  borderRadius: 16,
  textDecoration: "none",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.11)",
  backdropFilter: "blur(12px)",
};

export function EnlacesPage() {
  const config = useSiteConfig();
  const linktree = config.linktree;
  if (!linktree) return null;
  const links = linktree.links.filter((l) => l.active);

  return (
    <main
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        paddingTop: 96,
        paddingBottom: 64,
      }}
    >
      <RippleBackground variant="hero-center" opacity={0.14} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          <LogoLockup variant="inverted" size="lg" />
          {linktree.handle ? (
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
              {linktree.handle}
            </div>
          ) : null}
          {linktree.tagline || linktree.taglineAccent ? (
            <p className="t-quote" style={{ fontStyle: "italic", color: "#fff", maxWidth: "24ch" }}>
              {linktree.tagline}{" "}
              <b style={{ color: "var(--jci-blue)", fontStyle: "normal", fontWeight: 400 }}>
                {linktree.taglineAccent}
              </b>
            </p>
          ) : null}
        </header>

        <nav style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          {links.map((link) => {
            const IconFn = LINK_ICON[link.icon];
            return (
              <a
                key={link.id}
                className={`lt-link${link.isPrimary ? " is-primary" : ""}`}
                href={safeHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...cardBase,
                  ...(link.isPrimary
                    ? { background: "var(--jci-blue)", border: "1px solid transparent" }
                    : null),
                }}
              >
                {link.badge ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      right: 16,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      background: "var(--jci-yellow)",
                      color: "var(--jci-black)",
                      padding: "4px 9px",
                      borderRadius: 999,
                    }}
                  >
                    {link.badge}
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: link.isPrimary ? "rgba(255,255,255,0.18)" : "rgba(0,151,215,0.16)",
                    color: link.isPrimary ? "#fff" : "var(--jci-blue)",
                  }}
                >
                  {IconFn({ s: 21 })}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{link.title}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                    {link.description}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {Icon.chevRight({ s: 18 })}
                </span>
              </a>
            );
          })}
        </nav>

        <div style={{ marginTop: 32, display: "flex", gap: 14, justifyContent: "center" }}>
          {linktree.socials
            .filter((s) => safeHref(s.url) !== "#")
            .map((s) => {
              const meta = SOCIAL[s.platform];
              return (
                <a
                  key={s.platform}
                  className="lt-soc"
                  href={safeHref(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={meta.label}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.11)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    color: "rgba(255,255,255,0.92)",
                    textDecoration: "none",
                  }}
                >
                  {meta.icon({ s: 20 })}
                </a>
              );
            })}
        </div>

        <footer
          style={{
            marginTop: 40,
            textAlign: "center",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.9,
          }}
        >
          {config.contact.location ? <div>{config.contact.location}</div> : null}
          <div>JCI Oriente · Desde 1993</div>
        </footer>
      </div>
    </main>
  );
}
