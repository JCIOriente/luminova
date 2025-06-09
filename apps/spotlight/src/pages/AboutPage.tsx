import {
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@luminova/ui";
import { Award, Clock, Eye, Heart } from "lucide-react";
import FemalePersonPlaceholder from "../assets/female-person-placeholder.jpg";
import MalePersonPlaceholder from "../assets/male-person-placeholder.jpg";

export default function AboutPage() {
  const leadershipTeam = [
    {
      name: "Abigail Mamani",
      position: "Presidenta",
      photo: FemalePersonPlaceholder,
      bio: "",
    },
    {
      name: "Arnold Gandarillas",
      position: "Vicepresidente Ejecutivo",
      photo: MalePersonPlaceholder,
      bio: "",
    },
    {
      name: "Juan Carlos Orellana",
      position: "Vicepresidente de Area",
      photo: MalePersonPlaceholder,
      bio: "",
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="bg-primary relative py-20 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold md:text-5xl">
              Sobre Nosotros
            </h1>
            <p className="mb-1 text-xl text-white/90">
              Conoce más sobre JCI Oriente, nuestra historia, misión, valores y
              el equipo que hace posible nuestro impacto.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision Section */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <div className="space-y-6">
              <div>
                <h2 className="mb-6 flex items-center text-3xl font-bold">
                  <Eye className="text-primary mr-3 h-7 w-7" />
                  Nuestra Visión
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Ser la principal red mundial de jóvenes líderes.
                </p>
              </div>

              <div>
                <h2 className="mb-6 flex items-center text-3xl font-bold">
                  <Heart className="text-primary mr-3 h-7 w-7" />
                  Nuestra Misión
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Ofrecer oportunidades de desarrollo del liderazgo que
                  empoderen a los jóvenes para crear un cambio positivo.
                </p>
              </div>
            </div>

            <div>
              <h2 className="mb-6 flex items-center text-3xl font-bold">
                <Award className="text-primary mr-3 h-7 w-7" />
                Nuestros Valores
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Que la fe en Dios da sentido y objeto a la vida;
                <br />
                Que la hermandad de los hombres trasciende la soberanía de las
                naciones;
                <br />
                Que la justicia económica puede ser mejor obtenida por hombres
                libres a través de la libre empresa;
                <br />
                Que los gobiernos deben ser de leyes más que de hombres;
                <br />
                Que el gran tesoro de la tierra reside en la personalidad
                humana;
                <br />
                Y que servir a la humanidad es la mejor obra de una vida.
                <br />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership Team Section */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-6 text-3xl font-bold">
              Nuestro Equipo de Liderazgo
            </h2>
            <p className="text-muted-foreground mx-auto max-w-3xl text-lg">
              Conoce a los líderes que guían JCI Oriente en su misión de crear
              impacto positivo y desarrollar jóvenes líderes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {leadershipTeam.map((member, index) => (
              <Card
                key={index}
                className="overflow-hidden transition-shadow hover:shadow-md"
              >
                <div className="aspect-video">
                  <img
                    src={member.photo}
                    alt={`${member.name}, ${member.position}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <CardContent className="pt-6">
                  <h3 className="mb-1 text-xl font-semibold">{member.name}</h3>
                  <p className="text-primary mb-4 font-medium">
                    {member.position}
                  </p>
                  <p className="text-muted-foreground text-sm">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-6 text-3xl font-bold">Preguntas Frecuentes</h2>
            <p className="text-muted-foreground mx-auto max-w-3xl text-lg">
              Respuestas a las preguntas más comunes sobre JCI Oriente y nuestra
              organización.
            </p>
          </div>

          <div className="mx-auto max-w-3xl">
            <Tabs defaultValue="general">
              <TabsList className="mb-8 grid grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="membership">Membresía</TabsTrigger>
                <TabsTrigger value="programs">Programas</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6">
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">¿Qué es JCI?</h3>
                  <p className="text-muted-foreground">
                    Junior Chamber International (JCI) es una organización
                    mundial de jóvenes ciudadanos activos de 18 a 40 años que
                    comparten la creencia de que para crear cambios positivos,
                    debemos mejorar nosotros mismos y el mundo que nos rodea.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Cuál es la relación entre JCI Oriente y JCI Internacional?
                  </h3>
                  <p className="text-muted-foreground">
                    JCI Oriente es una organización local afiliada a JCI
                    Venezuela, que a su vez forma parte de JCI Internacional.
                    Compartimos la misma misión, visión y valores, pero operamos
                    con autonomía para abordar las necesidades específicas de
                    nuestra región.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿JCI es una organización política o religiosa?
                  </h3>
                  <p className="text-muted-foreground">
                    No. JCI es una organización no gubernamental, no política y
                    no sectaria. Respetamos todas las creencias religiosas y
                    opiniones políticas, pero no nos afiliamos a ninguna de
                    ellas. Nuestro enfoque está en el desarrollo del liderazgo y
                    el servicio comunitario.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="membership" className="space-y-6">
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Cuáles son los requisitos para ser miembro?
                  </h3>
                  <p className="text-muted-foreground">
                    Los requisitos principales son: tener entre 18 y 40 años,
                    compartir los valores de la organización, tener disposición
                    para el trabajo comunitario y compromiso con el desarrollo
                    personal y profesional.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Qué beneficios obtengo al ser miembro?
                  </h3>
                  <p className="text-muted-foreground">
                    Como miembro obtendrás: oportunidades de desarrollo de
                    habilidades de liderazgo, acceso a una red global de
                    contactos, formación continua, participación en proyectos de
                    impacto social, y posibilidades de viajar e intercambiar
                    experiencias internacionales.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Cuál es el proceso para unirme?
                  </h3>
                  <p className="text-muted-foreground">
                    El proceso incluye completar un formulario de solicitud,
                    asistir a una entrevista informativa, participar en algunas
                    actividades como invitado y finalmente, tras la aprobación,
                    realizar el pago de la membresía anual.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="programs" className="space-y-6">
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Qué tipo de proyectos desarrollan?
                  </h3>
                  <p className="text-muted-foreground">
                    Desarrollamos proyectos en cuatro áreas principales:
                    desarrollo de liderazgo, proyectos comunitarios,
                    emprendimiento y cooperación internacional. Cada área tiene
                    programas específicos diseñados para generar impacto.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Puedo proponer mis propios proyectos?
                  </h3>
                  <p className="text-muted-foreground">
                    ¡Absolutamente! Incentivamos a nuestros miembros a proponer
                    e implementar sus propias ideas de proyectos. Contarás con
                    el apoyo, mentoría y recursos de la organización para
                    desarrollarlos.
                  </p>
                </div>
                <div className="bg-background rounded-lg p-6">
                  <h3 className="mb-4 text-xl font-semibold">
                    ¿Cómo se financian los proyectos?
                  </h3>
                  <p className="text-muted-foreground">
                    Los proyectos se financian a través de diversas fuentes:
                    cuotas de membresía, eventos de recaudación de fondos,
                    alianzas con empresas e instituciones, subvenciones y
                    donaciones. Cada proyecto tiene su estructura de
                    financiamiento específica.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>
    </>
  );
}
