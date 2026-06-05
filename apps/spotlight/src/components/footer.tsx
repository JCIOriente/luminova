import { useNavigate } from "@tanstack/react-router";
import { LogoLockup } from "./logo-lockup";
import { RippleBackground } from "./ripple";
import { Icon } from "./icons";

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
  const navigate = useNavigate();
  const go = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    void navigate({ to });
  };
  const goToPrograms = (e: React.MouseEvent) => {
    e.preventDefault();
    void navigate({ to: "/" });
    setTimeout(
      () => document.getElementById("programas")?.scrollIntoView({ behavior: "smooth" }),
      80,
    );
  };

  return (
    <footer className="site-footer">
      <RippleBackground variant="footer" color="#FFFFFF" opacity={0.045} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="footer-cols">
          <div className="footer-col">
            <LogoLockup variant="inverted" size="sm" />
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
              <a href="#" aria-label="Facebook" style={SOCIAL_STYLE}>
                <Icon.facebook />
              </a>
              <a href="#" aria-label="Instagram" style={SOCIAL_STYLE}>
                <Icon.instagram />
              </a>
              <a href="#" aria-label="TikTok" style={SOCIAL_STYLE}>
                <Icon.tiktok />
              </a>
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
                <a href="/" onClick={goToPrograms}>
                  Programas
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Contacto</h4>
            <ul>
              <li>
                <a href="mailto:jci.orienteolm@gmail.com">jci.orienteolm@gmail.com</a>
              </li>
              <li>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  Santa Cruz de la Sierra, Bolivia
                </span>
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
              <li>
                <a href="https://jci.cc" target="_blank" rel="noreferrer">
                  JCI Worldwide ↗
                </a>
              </li>
              <li>
                <a href="#" target="_blank" rel="noreferrer">
                  JCI Bolivia ↗
                </a>
              </li>
              <li>
                <a href="#" target="_blank" rel="noreferrer">
                  JCI Americas ↗
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-strip">
          <div>
            © {new Date().getFullYear()} JCI Oriente. Miembro de{" "}
            <a href="#" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
              JCI Bolivia
            </a>
            .
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <a href="#">Privacidad</a>
            <a href="#">Términos</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
