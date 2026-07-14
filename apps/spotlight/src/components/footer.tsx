import { useNavigate } from "@tanstack/react-router";
import { LogoLockup, RippleBackground } from "@luminova/ui";
import { useSiteConfig } from "../site-config/use-site-config";
import { safeHref } from "../site-config/safe-href";
import { BACKSTAGE_URL } from "../config/external-links";
import { SocialIconLinks } from "./social-icon-links";

const JCI_BOLIVIA_URL = "https://jcibolivia.org/";
const CURRENT_YEAR = new Date().getFullYear();

const SOCIAL_STYLE: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
};

export function Footer() {
  const config = useSiteConfig();
  const navigate = useNavigate();
  const go = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    void navigate({ to });
  };
  return (
    <footer className="site-footer">
      <RippleBackground variant="footer" color="var(--color-jci-white)" opacity={0.045} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="footer-cols">
          <div className="footer-col">
            <LogoLockup variant="inverted" size="sm" loading="lazy" />
            <p
              style={{
                marginTop: 22,
                fontSize: 15,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.55,
                maxWidth: 320,
              }}
            >
              Capítulo Santa Cruz de la Cámara Junior Internacional. Desarrollando líderes desde
              1993.
            </p>
            <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
              <SocialIconLinks style={SOCIAL_STYLE} />
            </div>
          </div>
          <div className="footer-col">
            <h4>Sitio</h4>
            <ul>
              <li>
                <a href="/" onClick={(e) => go(e, "/")}>
                  Inicio
                </a>
              </li>
              <li>
                <a href="/about" onClick={(e) => go(e, "/about")}>
                  Quiénes Somos
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => go(e, "/contact")}>
                  Contacto
                </a>
              </li>
              <li>
                <a href="/impacto" onClick={(e) => go(e, "/impacto")}>
                  Impacto
                </a>
              </li>
              <li>
                <a href={BACKSTAGE_URL}>Portal de miembros</a>
              </li>
              <li>
                <a href="/linktree" onClick={(e) => go(e, "/linktree")}>
                  Linktree
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Contacto</h4>
            <ul>
              <li>
                <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>
              </li>
              <li>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>{config.contact.location}</span>
              </li>
              <li>
                <a href="/contact" onClick={(e) => go(e, "/contact")}>
                  Escríbenos →
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Red JCI</h4>
            <ul>
              {config.contact.links.map((link) => (
                <li key={link.label}>
                  <a href={safeHref(link.url)} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-strip">
          <div>
            © {CURRENT_YEAR} JCI Oriente. Miembro de{" "}
            <a
              href={JCI_BOLIVIA_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              JCI Bolivia
            </a>
            .
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <a href="/privacidad" onClick={(e) => go(e, "/privacidad")}>
              Privacidad
            </a>
            <a href="/terminos" onClick={(e) => go(e, "/terminos")}>
              Términos
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
