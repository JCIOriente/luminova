# Manual de administración

Para quienes operan la plataforma: Presidencia, Secretaría, Membresía y las direcciones
de proyecto. No hace falta saber programar.

Todo esto se hace desde el panel de administración:
**https://jcioriente-backstage.web.app**

> Las capturas de pantalla están pendientes. Los pasos son correctos y se pueden seguir
> sin ellas.

## Antes de empezar

Necesitás una cuenta. **No hay registro público**: alguien con permiso de Membresía o
Administrador te da de alta y recibís una invitación por correo para definir tu
contraseña.

Si olvidaste la contraseña, usá **¿Olvidaste tu contraseña?** en la pantalla de ingreso.

---

## 1. Dar de alta a un miembro nuevo

<!-- SCREENSHOT: pantalla de Miembros con el botón de agregar resaltado -->

1. Entrá a **Miembros**.
2. Botón **Agregar miembro**. Se abre un panel lateral.
3. Completá los datos. Son obligatorios: **nombre, correo, género, fecha de nacimiento,
   fecha de ingreso y estado**. El resto (teléfono, profesión, cargo, comisiones) se
   puede cargar después.
4. **Guardar**.

<!-- SCREENSHOT: panel lateral de alta de miembro con los campos obligatorios -->

El miembro ya aparece en el listado, pero **todavía no puede ingresar**.

### Darle acceso

5. Abrí la ficha del miembro y usá la opción de **invitar**.
6. Le llega un correo de Firebase para que defina su contraseña.

<!-- SCREENSHOT: ficha de miembro con la acción de invitar -->

> El correo puede caer en spam. Si no le llega en unos minutos, pedile que lo revise
> antes de reenviar.

### Darlo de baja

Se usa **eliminar**, que es una baja lógica: el miembro deja de aparecer en los listados
activos pero **su historial de participaciones y puntos se conserva**. No se borra nada
de forma definitiva. Es a propósito: el registro del capítulo tiene que sobrevivir a los
cambios de directiva.

---

## 2. Registrar asistencia en una actividad

Esto es lo que alimenta los puntos. Si no se registra la asistencia, no hay puntos.

<!-- SCREENSHOT: detalle de actividad, pestaña de asistencia -->

1. **Actividades** → abrí la actividad.
2. Entrá a la pestaña de **asistencia**.
3. Botón de **escanear**. Se abre el lector de QR.
4. Cada miembro muestra su **credencial QR** desde su panel (**Mi panel**) y la escanea.
5. La lista se actualiza en vivo, con el porcentaje de asistencia.

<!-- SCREENSHOT: modal de escaneo de QR en acción -->

**Si alguien no tiene el teléfono a mano**, usá el registro manual: se lo busca por
nombre y se lo agrega.

**Si te equivocaste**, cada fila tiene **deshacer**.

### Lo que conviene saber

- **La ventana de registro es el día de la actividad** (hora de Bolivia). Fuera de ese
  día no se puede registrar, salvo que seas Administrador.
- **Apenas hay un registro, la actividad se bloquea parcialmente**: no se le puede
  cambiar la fecha de inicio ni la categoría, porque son los datos con los que se
  calculan los puntos.
- **Los puntos se acreditan solos**, en segundos. Nadie los escribe a mano.

---

## 3. Editar el contenido del sitio público

El sitio público se edita desde el panel. **No hace falta desplegar nada ni pedirle nada
a un programador.**

<!-- SCREENSHOT: pantalla de Configuración del sitio -->

1. **Configuración** (`/config`).
2. Editá lo que corresponda: historia, misión, visión, valores, estadísticas, datos de
   contacto, redes sociales, enlace al mapa.
3. **Guardar**. El cambio se ve en el sitio público en el momento.

Los enlaces de la página de enlaces (tipo *linktree*) se administran desde su propia
pantalla y los edita la Presidencia.

---

## 4. Publicar un aliado

Los aliados tienen **dos caras**: la ficha interna, con datos de contacto, y lo que se
muestra al público.

<!-- SCREENSHOT: pantalla de Aliados -->

1. **Aliados** → **Agregar**.
2. Cargá los datos internos: razón social, persona de contacto, teléfono, correo.
3. Para que **aparezca en el sitio público**, cargá además el **logo** y la **categoría**
   (Universidades, Instituciones públicas, Organizaciones, Empresas).

<!-- SCREENSHOT: formulario de aliado con logo y categoría -->

> **Importante:** el teléfono, el correo y la persona de contacto **nunca** llegan al
> sitio público. Al público solo va el nombre, el logo y la categoría. Está garantizado
> por el diseño del sistema, no por una configuración que alguien pueda cambiar por
> error.
>
> Un aliado **sin logo o sin categoría simplemente no se publica**. No es un error: es
> la forma de tener aliados registrados internamente sin mostrarlos.

---

## 5. Revisar los contactos del sitio

El formulario de contacto del sitio público genera **prospectos**.

<!-- SCREENSHOT: pantalla de Prospectos -->

1. **Prospectos** (`/leads`).
2. Revisá los nuevos, respondé por fuera y marcá su estado.

Conviene revisarlo con una periodicidad fija. Nadie recibe un aviso automático.

---

## 6. Enviar una notificación

<!-- SCREENSHOT: pantalla de Notificaciones -->

1. **Notificaciones**.
2. Redactá el mensaje y elegí a quién va dirigido.
3. **Enviar**. Llega a la bandeja de entrada dentro de la plataforma y, si la persona
   instaló la aplicación en su teléfono y aceptó las notificaciones, también como aviso
   push.

El push es **de mejor esfuerzo**: si falla, el mensaje igual queda en la bandeja. No lo
uses como único canal para algo urgente.

---

## 7. Tareas de inicio de gestión

Al abrir una gestión nueva hay tres cosas que conviene hacer en orden:

1. **Crear la gestión** y cargar la directiva.
2. **Inicializar las reglas de puntos** (`/point-rules` → **Inicializar**).
   ⚠️ **Hasta que se haga, los registros de asistencia otorgan cero puntos.** Es el
   olvido más frecuente y el más difícil de notar.
3. **Asignar los cargos** de la gestión en **Cargos** (`/positions`).

Las asignaciones de gestiones anteriores se conservan: el historial no se pisa al
cambiar de directiva.

---

## Si algo no funciona

- **"No veo una pantalla que antes veía."** Lo más probable es un cambio de rol. Se
  revisa en **Permisos**; ver [capacidades-por-rol.md](capacidades-por-rol.md).
- **"Registré asistencia y no aparecieron los puntos."** Casi siempre es que las reglas
  de puntos de la gestión no se inicializaron (punto 7.2).
- **"El aliado no sale en el sitio."** Le falta el logo o la categoría.
- **Cualquier otra cosa:** anotá qué pantalla, qué hiciste y qué esperabas, y pasáselo a
  quien mantiene la plataforma. Eso es más útil que "no anda".

## Ver también

- [capacidades-por-rol.md](capacidades-por-rol.md) — quién puede hacer qué
- [impacto.md](impacto.md) — qué puede reportar el capítulo
- [`README.es.md`](../../README.es.md) — qué es la plataforma
