import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "../components/legal-page";
import { useSiteConfig } from "../site-config/use-site-config";

export const Route = createFileRoute("/terminos")({
  component: Terminos,
});

function Terminos() {
  const config = useSiteConfig();
  const sections: LegalSection[] = [
    {
      heading: "1. Aceptación",
      body: (
        <p style={{ margin: 0 }}>
          Al usar este sitio aceptas estos términos. Si no estás de acuerdo, te pedimos no continuar
          navegando. El sitio es operado por JCI Oriente, capítulo de Santa Cruz de la Cámara Junior
          Internacional.
        </p>
      ),
    },
    {
      heading: "2. Uso del sitio",
      body: (
        <p style={{ margin: 0 }}>
          Este sitio tiene fines informativos sobre el capítulo, sus programas e impacto. Te
          comprometes a usarlo de forma lícita y a no intentar dañar, sobrecargar o vulnerar su
          funcionamiento ni el de sus servicios asociados.
        </p>
      ),
    },
    {
      heading: "3. Propiedad intelectual",
      body: (
        <p style={{ margin: 0 }}>
          La marca JCI y los signos de Junior Chamber International pertenecen a sus titulares. Los
          textos, imágenes y materiales de JCI Oriente publicados aquí son de su autoría o cuentan
          con autorización de uso. No los reproduzcas con fines comerciales sin permiso previo.
        </p>
      ),
    },
    {
      heading: "4. Contenido editable",
      body: (
        <p style={{ margin: 0 }}>
          Parte del contenido (cifras, hitos, enlaces y lemas de gestión) es administrado por el
          comité del capítulo y puede cambiar. Hacemos un esfuerzo razonable por mantenerlo
          actualizado, pero no garantizamos que esté libre de errores en todo momento.
        </p>
      ),
    },
    {
      heading: "5. Enlaces externos",
      body: (
        <p style={{ margin: 0 }}>
          El sitio puede enlazar a páginas de terceros (redes sociales, JCI Bolivia, JCI Worldwide,
          mapas). No somos responsables del contenido ni de las prácticas de esos sitios externos.
        </p>
      ),
    },
    {
      heading: "6. Formulario de contacto",
      body: (
        <p style={{ margin: 0 }}>
          El formulario de contacto abre tu cliente de correo para escribirnos; no constituye una
          inscripción formal ni garantiza la aceptación como miembro. Responderemos a las consultas
          según nuestra disponibilidad.
        </p>
      ),
    },
    {
      heading: "7. Limitación de responsabilidad",
      body: (
        <p style={{ margin: 0 }}>
          El sitio se ofrece «tal cual». En la medida que lo permita la ley, JCI Oriente no será
          responsable por daños derivados del uso o de la imposibilidad de uso del sitio.
        </p>
      ),
    },
    {
      heading: "8. Cambios y contacto",
      body: (
        <p style={{ margin: 0 }}>
          Podemos modificar estos términos en cualquier momento; la versión vigente estará siempre
          en esta página. Estos términos se rigen por las leyes de Bolivia. Ante cualquier duda,
          escríbenos a <a href={`mailto:${config.contact.email}`}>{config.contact.email}</a>.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Términos"
      title="Términos de uso"
      intro="Las condiciones bajo las que ponemos a tu disposición el sitio de JCI Oriente."
      updatedLabel="Versión inicial · 2026. Documento de referencia; no sustituye asesoría legal."
      sections={sections}
    />
  );
}
