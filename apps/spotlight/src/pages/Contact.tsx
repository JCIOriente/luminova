import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from "@luminova/ui";
import { Calendar, Mail, MapPin, Phone, Send } from "lucide-react";
import { useState } from "react";

export default function ContactPage() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    interest: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, interest: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Simple validation
    if (!formData.name || !formData.email || !formData.message) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }

    // Here you would normally send the form data to a server
    // For this example, we'll just show a success message
    toast({
      title: "Mensaje enviado",
      description: "Gracias por contactarnos. Responderemos a la brevedad.",
    });

    // Reset form
    setFormData({
      name: "",
      email: "",
      subject: "",
      message: "",
      interest: "",
    });
  };

  return (
    <>
      {/* Hero Section */}
      <section className="bg-primary relative py-20 text-white">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold md:text-5xl">Contáctanos</h1>
            <p className="text-xl text-white/90">
              Estamos aquí para responder tus preguntas y ayudarte a conectar
              con JCI Oriente.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form and Info Section */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h2 className="mb-6 text-3xl font-bold">Envíanos un Mensaje</h2>
              <p className="text-muted-foreground mb-8">
                Completa el formulario y nos pondremos en contacto contigo lo
                antes posible.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Nombre completo{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Tu nombre"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Correo electrónico{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="tucorreo@ejemplo.com"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Asunto</Label>
                  <Input
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="¿En qué podemos ayudarte?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interest">Área de interés</Label>
                  <Select
                    value={formData.interest}
                    onValueChange={handleSelectChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="membership">Membresía</SelectItem>
                      <SelectItem value="programs">Programas</SelectItem>
                      <SelectItem value="events">Eventos</SelectItem>
                      <SelectItem value="partnerships">Alianzas</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">
                    Mensaje <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Escribe tu mensaje aquí..."
                    rows={5}
                    required
                  />
                </div>
                <Button type="submit" className="w-full md:w-auto">
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Mensaje
                </Button>
              </form>
            </div>

            <div className="order-1 space-y-8 lg:order-2">
              <div>
                <h2 className="mb-6 text-3xl font-bold">
                  Información de Contacto
                </h2>
                <p className="text-muted-foreground mb-8">
                  Puedes contactarnos directamente o visitar nuestra sede en los
                  siguientes horarios.
                </p>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <MapPin className="text-primary mt-1 h-6 w-6 shrink-0" />
                    <div>
                      <h3 className="mb-1 font-semibold">Dirección</h3>
                      <p className="text-muted-foreground">
                        Santa Cruz de la Sierra, Bolivia
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Mail className="text-primary mt-1 h-6 w-6 shrink-0" />
                    <div>
                      <h3 className="mb-1 font-semibold">Correo Electrónico</h3>
                      <p className="text-muted-foreground">
                        <a
                          href="mailto:jci.orienteolm@gmail.com"
                          className="hover:text-primary transition-colors"
                        >
                          jci.orienteolm@gmail.com
                        </a>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Phone className="text-primary mt-1 h-6 w-6 shrink-0" />
                    <div>
                      <h3 className="mb-1 font-semibold">Teléfono</h3>
                      <p className="text-muted-foreground">
                        <a
                          href="tel:+59170000001"
                          className="hover:text-primary transition-colors"
                        >
                          +59170000001
                        </a>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Calendar className="text-primary mt-1 h-6 w-6 shrink-0" />
                    <div>
                      <h3 className="mb-1 font-semibold">
                        Horario de Atención
                      </h3>
                      <p className="text-muted-foreground">
                        Lunes a Viernes: 9:00 AM - 6:00 PM
                        <br />
                        Sábado: 9:00 AM - 1:00 PM
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-6">
                <h3 className="mb-4 text-lg font-semibold">
                  ¿Quieres una respuesta más rápida?
                </h3>
                <p className="text-muted-foreground mb-4">
                  Para consultas urgentes, recomendamos contactarnos
                  directamente por teléfono durante nuestro horario de atención.
                </p>
                <Button variant="outline" asChild>
                  <a href="tel:+581234567890">Llamar Ahora</a>
                </Button>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold">
                  Síguenos en Redes Sociales
                </h3>
                <div className="flex gap-4">
                  <Button variant="outline" size="icon" asChild>
                    <a
                      href="https://www.facebook.com/JCI.Oriente.Bolivia"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-facebook"
                      >
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                      </svg>
                    </a>
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a
                      href="https://www.instagram.com/jci.oriente"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-instagram"
                      >
                        <rect
                          width="20"
                          height="20"
                          x="2"
                          y="2"
                          rx="5"
                          ry="5"
                        />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                      </svg>
                    </a>
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a
                      href="https://www.linkedin.com/company/jci-oriente"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="LinkedIn"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-linkedin"
                      >
                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                        <rect width="4" height="12" x="2" y="9" />
                        <circle cx="4" cy="4" r="2" />
                      </svg>
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold">Preguntas Frecuentes</h2>
            <p className="text-muted-foreground mx-auto max-w-3xl text-lg">
              Respuestas a las consultas más comunes sobre cómo contactarnos.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="mb-3 text-xl font-semibold">
                ¿Cuál es el tiempo de respuesta?
              </h3>
              <p className="text-muted-foreground">
                Nos esforzamos por responder a todas las consultas dentro de
                24-48 horas hábiles. Para asuntos urgentes, te recomendamos
                contactarnos por teléfono.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-6">
              <h3 className="mb-3 text-xl font-semibold">
                ¿Cómo puedo agendar una reunión con un directivo?
              </h3>
              <p className="text-muted-foreground">
                Puedes solicitar una reunión enviando un correo a
                info@jcioriente.org especificando el motivo y con quién te
                gustaría reunirte. Te responderemos con las opciones
                disponibles.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
