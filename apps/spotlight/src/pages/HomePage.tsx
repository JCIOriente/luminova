import { Button, Card, CardContent } from "@luminova/ui";
import {
  Activity,
  ArrowRight,
  Award,
  Calendar,
  Globe,
  GraduationCap,
  Handshake,
  Users,
} from "lucide-react";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-primary relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="bg-primary/70 absolute inset-0 mix-blend-multiply" />
          <img
            src="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
            alt="Jóvenes colaborando"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="container relative mx-auto px-4 py-32 lg:py-48">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              Formando líderes para un mejor futuro
            </h1>
            <p className="mb-8 text-xl leading-relaxed text-white/90">
              JCI Oriente brinda a jóvenes las herramientas para desarrollar
              habilidades de liderazgo, responsabilidad social y emprendimiento.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/85"
                asChild
              >
                <a href="/contact">Únete a Nosotros</a>
              </Button>
              <Button
                size="lg"
                className="text-primary bg-white hover:bg-white/90"
                asChild
              >
                <a href="/about">Conoce Más</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* About Overview Section */}
      <section className="bg-background py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h2 className="mb-6 text-3xl font-bold">¿Qué es JCI Oriente?</h2>
              <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
                Somos la organización líder de jóvenes ciudadanos activos en la
                región oriental de Bolivia. Creamos oportunidades de desarrollo
                que empoderan a los jóvenes para crear cambios positivos.
              </p>
              <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
                Nuestra red global de casi 170.000 miembros activos está
                comprometida con la creación de impacto en sus comunidades
                mientras desarrollan habilidades que los distinguen personal y
                profesionalmente.
              </p>
              {
                /*<Button variant="outline" className="group" asChild>
                <a href="/about">
                  Descubre Nuestra Historia
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>*/
              }
            </div>
            <div className="relative order-1 lg:order-2">
              <img
                src="https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                alt="Miembros de JCI Oriente"
                className="h-[400px] w-full rounded-lg object-cover shadow-lg"
              />
              <div className="bg-primary absolute -bottom-6 -left-6 hidden rounded-lg p-6 text-white shadow-lg md:block">
                <p className="mb-1 text-3xl font-bold">+40</p>
                <p className="text-sm">Miembros</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold">Nuestros Programas</h2>
            <p className="text-muted-foreground mx-auto max-w-3xl text-lg">
              Desarrollamos programas centrados en cuatro áreas principales que
              fortalecen a nuestros miembros y comunidades.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-background transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="bg-primary/10 mb-6 w-fit rounded-full p-3">
                  <GraduationCap className="text-primary h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">
                  Desarrollo de Liderazgo
                </h3>
                <p className="text-muted-foreground mb-6">
                  Formamos líderes efectivos a través de talleres, conferencias
                  y oportunidades de networking.
                </p>
                {
                  /*<Button variant="link" className="group p-0" asChild>
                  <a href="/programs#leadership">
                    Ver Más
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>*/
                }
              </CardContent>
            </Card>

            <Card className="bg-background transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="bg-primary/10 mb-6 w-fit rounded-full p-3">
                  <Handshake className="text-primary h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">
                  Proyectos Comunitarios
                </h3>
                <p className="text-muted-foreground mb-6">
                  Implementamos iniciativas que abordan necesidades locales y
                  crean soluciones sostenibles.
                </p>
                {
                  /*<Button variant="link" className="group p-0" asChild>
                  <a href="/programs#community">
                    Ver Más
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>*/
                }
              </CardContent>
            </Card>

            <Card className="bg-background transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="bg-primary/10 mb-6 w-fit rounded-full p-3">
                  <Activity className="text-primary h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">Emprendimiento</h3>
                <p className="text-muted-foreground mb-6">
                  Fomentamos el espíritu emprendedor y proporcionamos
                  herramientas para el desarrollo empresarial.
                </p>
                {
                  /*<Button variant="link" className="group p-0" asChild>
                  <a href="/programs#business">
                    Ver Más
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>*/
                }
              </CardContent>
            </Card>

            <Card className="bg-background transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="bg-primary/10 mb-6 w-fit rounded-full p-3">
                  <Globe className="text-primary h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-semibold">
                  Cooperación Internacional
                </h3>
                <p className="text-muted-foreground mb-6">
                  Promovemos la colaboración global y el intercambio cultural
                  con miembros JCI de todo el mundo.
                </p>
                <Button variant="link" className="group p-0" asChild>
                  <a href="/programs#international">
                    Ver Más
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Upcoming Events Section */}
      {
        /*
      <section className="bg-background py-20">
        <div className="container mx-auto px-4">
          <div className="mb-12 flex flex-col items-start justify-between md:flex-row md:items-center">
            <div>
              <h2 className="mb-3 text-3xl font-bold">Próximos Eventos</h2>
              <p className="text-muted-foreground max-w-2xl text-lg">
                Únete a nuestras actividades y expande tu red de contactos
                mientras desarrollas nuevas habilidades.
              </p>
            </div>
            <Button className="mt-4 md:mt-0" asChild>
              <a href="/events">Ver Todos los Eventos</a>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card className="bg-background overflow-hidden transition-shadow hover:shadow-md">
              <div className="relative h-48">
                <div className="bg-primary absolute right-0 top-0 m-4 rounded px-3 py-1 text-xs font-semibold text-white">
                  Destacado
                </div>
                <img
                  src="https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                  alt="Conferencia de Liderazgo"
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="pt-6">
                <div className="text-muted-foreground mb-3 flex items-center text-sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>15 de Octubre, 2025</span>
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  Conferencia Anual de Liderazgo
                </h3>
                <p className="text-muted-foreground mb-6">
                  Una jornada intensiva con ponentes internacionales sobre
                  tendencias en liderazgo y desarrollo profesional.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <a href="/events/leadership-conference">Inscríbete</a>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-background overflow-hidden transition-shadow hover:shadow-md">
              <div className="relative h-48">
                <img
                  src="https://images.pexels.com/photos/3810754/pexels-photo-3810754.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                  alt="Taller de Emprendimiento"
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="pt-6">
                <div className="text-muted-foreground mb-3 flex items-center text-sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>28 de Septiembre, 2025</span>
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  Taller de Emprendimiento Social
                </h3>
                <p className="text-muted-foreground mb-6">
                  Aprende a crear emprendimientos con propósito que resuelvan
                  problemas sociales y generen impacto positivo.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <a href="/events/social-entrepreneurship">Inscríbete</a>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-background overflow-hidden transition-shadow hover:shadow-md">
              <div className="relative h-48">
                <img
                  src="https://images.pexels.com/photos/6646983/pexels-photo-6646983.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                  alt="Networking"
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="pt-6">
                <div className="text-muted-foreground mb-3 flex items-center text-sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>7 de Noviembre, 2025</span>
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  Networking JCI Global
                </h3>
                <p className="text-muted-foreground mb-6">
                  Conecta con miembros JCI de toda Latinoamérica en este evento
                  virtual de networking profesional.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <a href="/events/global-networking">Inscríbete</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      */
      }

      {/* CTA Section */}
      <section className="bg-primary py-20 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-6 text-3xl font-bold">Forma Parte del Cambio</h2>
          <p className="mx-auto mb-10 max-w-3xl text-xl leading-relaxed">
            JCI Oriente te ofrece la oportunidad de desarrollar tu potencial
            mientras generas un impacto positivo en tu comunidad. ¡Únete hoy!
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Button
              size="lg"
              className="text-primary bg-white hover:bg-white/90"
              asChild
            >
              <a href="/contact">Conviértete en Miembro, ¡Ponte en contacto!</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Impact Stats Section */}
      <section className="bg-background py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-8 text-center md:grid-cols-4">
            <div>
              <div className="bg-primary/10 mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full p-4">
                <Users className="text-primary h-8 w-8" />
              </div>
              <h3 className="mb-2 text-4xl font-bold">40+</h3>
              <p className="text-muted-foreground">Miembros</p>
            </div>
            <div>
              <div className="bg-primary/10 mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full p-4">
                <Calendar className="text-primary h-8 w-8" />
              </div>
              <h3 className="mb-2 text-4xl font-bold">10+</h3>
              <p className="text-muted-foreground">Eventos Anuales</p>
            </div>
            <div>
              <div className="bg-primary/10 mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full p-4">
                <Award className="text-primary h-8 w-8" />
              </div>
              <h3 className="mb-2 text-4xl font-bold">10+</h3>
              <p className="text-muted-foreground">Premios Nacionales</p>
            </div>
            <div>
              <div className="bg-primary/10 mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full p-4">
                <Handshake className="text-primary h-8 w-8" />
              </div>
              <h3 className="mb-2 text-4xl font-bold">20+</h3>
              <p className="text-muted-foreground">Proyectos Comunitarios</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
