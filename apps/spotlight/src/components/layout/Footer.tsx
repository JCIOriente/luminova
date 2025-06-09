import { Button, Separator } from '@luminova/ui';
import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-muted/50 pb-8 pt-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-primary text-2xl font-bold">JCI</span>
              <span className="text-primary text-xl font-medium">Oriente</span>
            </Link>
            <p className="text-muted-foreground text-sm">
              Empoderando a jóvenes líderes para crear un impacto positivo en
              sus comunidades a través de iniciativas innovadoras y desarrollo
              personal.
            </p>
            <div className="flex gap-4">
              <Button variant="ghost" size="icon" asChild aria-label="Facebook">
                <a
                  href="https://www.facebook.com/JCI.Oriente.Bolivia"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Instagram"
              >
                <a
                  href="https://www.instagram.com/jci.oriente"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label="LinkedIn">
                <a
                  href="https://www.linkedin.com/company/jci-oriente"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Linkedin className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Enlaces Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/about"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Sobre Nosotros
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Contacto
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Programas</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/programs#leadership"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Desarrollo de Liderazgo
                </Link>
              </li>
              <li>
                <Link
                  to="/programs#community"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Proyectos Comunitarios
                </Link>
              </li>
              <li>
                <Link
                  to="/programs#business"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Emprendimiento
                </Link>
              </li>
              <li>
                <Link
                  to="/programs#international"
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  Cooperación Internacional
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Contacto</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-2">
                <MapPin className="text-primary mt-0.5 h-5 w-5 shrink-0" />
                <span className="text-muted-foreground text-sm">
                  Santa Cruz de la Sierra, Bolivia
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="text-primary h-5 w-5 shrink-0" />
                <span className="text-muted-foreground text-sm">
                  +59170000001
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="text-primary h-5 w-5 shrink-0" />
                <span className="text-muted-foreground text-sm">
                  jci.orienteolm@gmail.com
                </span>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-muted-foreground text-center text-xs md:text-left">
            © {currentYear} JCI Oriente. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            {/*<Link
              to="/privacy"
              className="text-muted-foreground hover:text-primary text-xs transition-colors"
            >
              Política de Privacidad
            </Link>
            <Link
              to="/terms"
              className="text-muted-foreground hover:text-primary text-xs transition-colors"
            >
              Términos de Uso
            </Link>*/}
          </div>
        </div>
      </div>
    </footer>
  );
}
