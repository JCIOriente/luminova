import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "../components/legal-page";
import { useSiteConfig } from "../site-config/use-site-config";

export const Route = createFileRoute("/privacidad")({
  component: Privacidad,
});

function Privacidad() {
  const config = useSiteConfig();
  const sections: LegalSection[] = [
    {
      heading: "1. Quiénes somos",
      body: (
        <p style={{ margin: 0 }}>
          Este sitio pertenece a JCI Oriente, capítulo de Santa Cruz de la Cámara Junior
          Internacional (Junior Chamber International), con sede en {config.contact.location}.
          Puedes escribirnos en cualquier momento a{" "}
          <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>.
        </p>
      ),
    },
    {
      heading: "2. Qué datos recolectamos",
      body: (
        <p style={{ margin: 0 }}>
          Cuando completas el formulario de contacto, registramos los datos que nos envías (nombre, correo electrónico, WhatsApp si decides compartirlo, motivo de contacto y tu mensaje) en nuestra base de datos (Cloud Firestore, de Google) para poder atender tu solicitud. Si activas las notificaciones, guardamos un identificador anónimo de tu navegador para enviarte avisos; no incluye tu nombre ni tu correo. No recopilamos ningún otro dato personal de forma automática mientras navegas.
        </p>
      ),
    },
    {
      heading: "3. Cómo usamos tu información",
      body: (
        <p style={{ margin: 0 }}>
          Usamos los datos que nos envías por el formulario únicamente para responder tu consulta,
          evaluar solicitudes de membresía o coordinar alianzas y prensa. Usamos tu número de WhatsApp, si lo compartes, solo para contactarte, y el identificador de notificaciones solo para enviarte avisos de JCI Oriente. No vendemos ni compartimos tu información con terceros con fines comerciales.
        </p>
      ),
    },
    {
      heading: "4. Cookies y almacenamiento local",
      body: (
        <p style={{ margin: 0 }}>
          No usamos cookies de publicidad ni de seguimiento. El sitio guarda en el almacenamiento
          local de tu navegador una copia del contenido público (textos y enlaces) para cargar más rápido en visitas posteriores, y recuerda si cerraste el aviso de notificaciones. Puedes borrar estos datos en cualquier momento desde la configuración de tu navegador.
        </p>
      ),
    },
    {
      heading: "5. Servicios de terceros",
      body: (
        <p style={{ margin: 0 }}>
          El sitio se aloja en Firebase (Google) y los mensajes del formulario se guardan en Cloud Firestore. Para prevenir usos automatizados usamos Firebase App Check con reCAPTCHA v3, de Google, que analiza señales de tu navegador para distinguir a las personas de los sistemas automatizados; aplican las políticas de privacidad de Google. El sitio también puede enlazar a plataformas externas como Instagram, Facebook, TikTok, LinkedIn, YouTube, WhatsApp y Google Maps; al seguir esos enlaces aplican las políticas de privacidad de cada
          plataforma, sobre las que no tenemos control.
        </p>
      ),
    },
    {
      heading: "6. Portal de miembros",
      body: (
        <p style={{ margin: 0 }}>
          El acceso de miembros y administradores se realiza en una plataforma separada y protegida
          con autenticación. Los datos de membresía se rigen por las normas internas del capítulo y
          no se gestionan desde este sitio público.
        </p>
      ),
    },
    {
      heading: "7. Tus derechos",
      body: (
        <p style={{ margin: 0 }}>
          Puedes solicitar acceder, corregir o eliminar la información que nos hayas compartido
          escribiéndonos a <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>.
          Atenderemos tu solicitud en un plazo razonable.
        </p>
      ),
    },
    {
      heading: "8. Cambios a esta política",
      body: (
        <p style={{ margin: 0 }}>
          Podemos actualizar esta política para reflejar mejoras del sitio o cambios normativos.
          Publicaremos siempre la versión vigente en esta página.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Privacidad"
      title="Política de privacidad"
      intro="Cómo tratamos la información cuando visitas el sitio de JCI Oriente o te pones en contacto con nosotros."
      updatedLabel="Actualizada en octubre de 2026. Documento de referencia; no sustituye asesoría legal."
      sections={sections}
    />
  );
}
