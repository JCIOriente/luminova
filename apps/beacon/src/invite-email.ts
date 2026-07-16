/**
 * Builds the "you've been invited" email as a document for the Firebase
 * Trigger Email extension (`firestore-send-email`, watching the `mail`
 * collection). The extension delivers the SMTP mail; beacon only enqueues.
 */

export interface InviteEmailInput {
  name: string;
  actionLink: string;
}

export interface MailDocument {
  to: string[];
  message: { subject: string; html: string; text: string };
}

/** Escape the few chars that could break out of an HTML attribute/text node —
 *  actionLink and the admin-entered name are interpolated into the email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SUBJECT = "Te damos acceso al portal de JCI Oriente";

export function buildInviteEmail(
  email: string,
  { name, actionLink }: InviteEmailInput,
): MailDocument {
  const firstName = name.trim().split(/\s+/)[0] || "Hola";
  const safeName = escapeHtml(firstName);
  const safeLink = escapeHtml(actionLink);

  const text = [
    `Hola ${firstName},`,
    "",
    "Te dieron acceso al portal interno de JCI Oriente. Crea tu contraseña y entra desde este enlace:",
    actionLink,
    "",
    "Si no esperabas esta invitación, puedes ignorar este correo.",
    "",
    "JCI Oriente · Santa Cruz, Bolivia",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#130f2d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:480px;width:100%">
        <tr><td style="background:#130f2d;padding:28px 32px">
          <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em">JCI Oriente</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600">Hola ${safeName},</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3a54">
            Te dieron acceso al portal interno de JCI Oriente. Crea tu contraseña para entrar y coordinar miembros, eventos y proyectos del capítulo.
          </p>
          <a href="${safeLink}" style="display:inline-block;background:#0097d7;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:999px">
            Crear mi contraseña
          </a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7a7a92">
            Si el botón no funciona, copia este enlace en tu navegador:<br>
            <span style="color:#0097d7;word-break:break-all">${safeLink}</span>
          </p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#7a7a92">
            Si no esperabas esta invitación, puedes ignorar este correo.
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eef0f6;font-size:12px;color:#9a9ab0">
          JCI Oriente · Santa Cruz, Bolivia
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { to: [email], message: { subject: SUBJECT, html, text } };
}
