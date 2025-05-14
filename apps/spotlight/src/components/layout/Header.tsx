import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@luminova/ui';
import { Menu, X } from 'lucide-react';
import { cn } from '@luminova/utils';

type NavItem = {
  path: string;
  label: string;
};

const navItems: NavItem[] = [
  { path: '/', label: 'Inicio' },
  { path: '/about', label: 'Nosotros' },
  // { path: "/programs", label: "Programas" },
  // { path: "/events", label: "Eventos" },
  // { path: "/membership", label: "Membresía" },
  // { path: "/news", label: "Noticias" },
  { path: '/contact', label: 'Contacto' },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Close mobile menu on route change
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 transition-all duration-300',
        {
          'bg-background/80 shadow-sm backdrop-blur-md': scrolled,
          'bg-transparent': !scrolled,
        },
      )}
    >
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-primary text-2xl font-bold">JCI</span>
          <span className="text-primary text-2xl font-medium">Oriente</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'hover:text-primary text-sm font-medium transition-colors',
                {
                  'text-primary': location.pathname === item.path,
                  'text-muted-foreground': location.pathname !== item.path,
                },
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Navigation Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="bg-background fixed inset-0 top-16 z-40 md:hidden">
          <nav className="container mx-auto flex flex-col gap-6 px-4 py-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'hover:text-primary p-2 text-lg font-medium transition-colors',
                  {
                    'text-primary': location.pathname === item.path,
                    'text-muted-foreground': location.pathname !== item.path,
                  },
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
