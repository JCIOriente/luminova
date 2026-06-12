import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import clsx from "clsx";
import { LogoLockup, Button, Icon } from "@luminova/ui";

function overToneFor(pathname: string): "dark" | "blue" | null {
  if (pathname === "/about") return "blue";
  if (pathname === "/") return "dark";
  return null;
}

export function Header() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const overTone = overToneFor(pathname);
  const overDark = overTone === "dark";
  const overBlue = overTone === "blue";
  const cls = clsx(
    "site-header",
    scrolled && "solid",
    !scrolled && overDark && "over-dark",
    !scrolled && overBlue && "over-blue",
  );

  const go = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    setMobileOpen(false);
    void navigate({ to });
  };

  const goToPrograms = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileOpen(false);
    const scroll = () =>
      document.getElementById("programas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (pathname === "/") {
      scroll();
    } else {
      void navigate({ to: "/" });
      setTimeout(scroll, 80);
    }
  };

  const logoVariant = scrolled
    ? "default"
    : overBlue
      ? "on-blue"
      : overDark
        ? "inverted"
        : "default";

  const ctaOnBlue = !scrolled && overBlue;
  const ctaOnDark = !scrolled && overDark;

  return (
    <>
      <header className={cls}>
        <div className="container">
          <a
            href="/"
            onClick={(e) => go(e, "/")}
            aria-label="Inicio — JCI Oriente"
            style={{ display: "flex", alignItems: "center" }}
          >
            <LogoLockup variant={logoVariant} size="sm" />
          </a>
          <nav className="nav-links desktop" aria-label="Principal">
            <a
              href="/about"
              onClick={(e) => go(e, "/about")}
              className={clsx("nav-link", pathname === "/about" && "active")}
            >
              Quiénes Somos
            </a>
            <a href="/" onClick={goToPrograms} className="nav-link">
              Programas
            </a>
            <a
              href="/impacto"
              onClick={(e) => go(e, "/impacto")}
              className={clsx("nav-link", pathname === "/impacto" && "active")}
            >
              Impacto
            </a>
            <a
              href="/contact"
              onClick={(e) => go(e, "/contact")}
              className={clsx("nav-link", pathname === "/contact" && "active")}
            >
              Contacto
            </a>
            <Button
              href="/contact"
              onClick={(e) => go(e, "/contact")}
              size="sm"
              variant="primary"
              onBlue={ctaOnBlue}
              onDark={ctaOnDark}
            >
              Únete a JCI Oriente
            </Button>
          </nav>
          <button className="hamburger" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}>
            <Icon.menu />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="mobile-nav" role="dialog" aria-modal="true">
          <div className="mobile-nav-top">
            <LogoLockup variant="inverted" size="sm" />
            <button
              className="hamburger"
              aria-label="Cerrar menú"
              onClick={() => setMobileOpen(false)}
              style={{ color: "#fff" }}
            >
              <Icon.close />
            </button>
          </div>
          <div className="mobile-nav-links">
            <a href="/" onClick={(e) => go(e, "/")} className="mobile-nav-link">
              Inicio
            </a>
            <a href="/about" onClick={(e) => go(e, "/about")} className="mobile-nav-link">
              Quiénes Somos
            </a>
            <a href="/impacto" onClick={(e) => go(e, "/impacto")} className="mobile-nav-link">
              Impacto
            </a>
            <a href="/contact" onClick={(e) => go(e, "/contact")} className="mobile-nav-link">
              Contacto
            </a>
          </div>
          <div style={{ marginTop: "auto", paddingTop: 24 }}>
            <Button
              href="/contact"
              onClick={(e) => go(e, "/contact")}
              variant="primary"
              iconRight={<Icon.arrowRight />}
            >
              Únete a JCI Oriente
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
