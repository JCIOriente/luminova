# Qué puede hacer cada rol

Para la Directiva. Explica quién puede hacer qué en la plataforma, sin entrar al código.

> **Esto es una foto de los valores por defecto, no una regla fija.** Los roles se editan
> en tiempo real desde **Permisos** (`/permisos`) sin necesidad de desplegar nada. Si
> alguien cambió un rol, esta tabla deja de describir tu instalación — la pantalla de
> Permisos siempre manda.
>
> Fuente de los valores por defecto: `packages/types/src/role-definition.ts`
> (`BUILT_IN_ROLE_PERMS`), a 2026-09-20.

## Los nueve roles

| Rol | Para qué existe |
|---|---|
| **Administrador** | Acceso total a la plataforma. |
| **Membresía** | Crear y editar miembros; ver puntos y cargos. |
| **Tesorería** | Gestionar pagos; ver miembros y puntos. |
| **Comité Ejecutivo** | Ver la gestión del capítulo; enviar notificaciones. |
| **Proyectos** | Gestionar proyectos, programas y actividades; registrar asistencia. |
| **Actividades** | Crear y editar actividades; registrar asistencia. |
| **Secretaría** | Comunicación del capítulo: notificaciones, prospectos y aliados. |
| **Escáner** | Registrar asistencia en las actividades del capítulo. |
| **Miembro** | Ver y editar su propio perfil; ver puntos y eventos. |

## Qué alcanza cada rol

**Ver** = puede consultar · **Gestionar** = puede crear, editar y dar de baja ·
**—** = no tiene acceso

| | Admin | Membresía | Tesorería | Comité Ejec. | Proyectos | Actividades | Secretaría | Escáner | Miembro |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Miembros | Gestionar | Gestionar | Ver | Ver | — | — | — | — | Ver |
| Puntos de miembros | Gestionar | Ver | Ver | Ver | — | — | — | — | Ver |
| Cargos | Gestionar | Ver | — | — | — | — | — | — | — |
| Programas | Gestionar | — | — | Ver | Gestionar | — | — | — | Ver |
| Proyectos | Gestionar | — | — | Ver | Gestionar | — | — | — | Ver |
| Actividades | Gestionar | — | — | — | Gestionar | Gestionar | — | Ver | Ver |
| Registrar asistencia | Sí | — | — | — | Sí | Sí | — | Sí | — |
| Aliados | Gestionar | — | — | Ver | Ver | — | Gestionar | — | — |
| Prospectos (contacto) | Gestionar | — | — | Ver | — | — | Gestionar | — | — |
| Notificaciones | Gestionar | — | — | Enviar | — | — | Gestionar | — | — |
| Reglas de puntos | Gestionar | — | — | Ver | — | — | — | — | — |
| Destacar en el sitio público | Sí | — | — | — | Sí | — | — | — | — |
| Roles y permisos | Gestionar | — | — | — | — | — | — | — | — |

## Detalles que suelen sorprender

**El Comité Ejecutivo no asigna cargos.** Puede ver quién ocupa qué, pero asignar
cargos y comisiones es solo del Administrador. Fue una decisión deliberada.

**Un Miembro no ve las Reglas de puntos.** Si se le diera ese acceso, la pantalla de
administración aparecería en el menú de todos los miembros. Por eso el rol Miembro
alcanza el catálogo de actividades, programas y proyectos, pero no la matriz de puntaje.

**El Escáner solo registra asistentes.** Puede marcar la asistencia de un asistente,
pero no la de directores ni del equipo, y esa restricción se aplica en el servidor —
no depende de que la pantalla se lo oculte.

**Secretaría es la dueña de los aliados**, no Membresía. Membresía se ocupa de personas;
Secretaría, de la comunicación del capítulo hacia afuera.

**Un rol se puede desactivar.** Al desactivarlo, quienes lo tenían pierden lo que ese rol
les daba, aunque el nombre del rol siga registrado.

## Qué no se puede configurar

Algunas reglas están en el código y no se editan desde Permisos, a propósito, porque una
pantalla no puede expresarlas con seguridad:

- Que cada miembro pueda ver y editar **su propio** perfil.
- Que el Escáner se limite a asistentes.
- Que los puntos los calcule el sistema y nadie los escriba a mano.
- Que los datos privados de un aliado (contacto, teléfono, correo) nunca lleguen al
  sitio público.

## Un límite técnico que conviene conocer

Cada persona puede acumular **como máximo 30 permisos** entre todos sus roles. Si se
pasa de ese número, el sistema **no le da ninguno** en lugar de darle algunos — falla de
forma visible y segura, nunca a medias. La pantalla de Permisos avisa antes de guardar.

En la práctica solo aparece si se le asignan muchos roles a la misma persona.

## Dónde se cambia

**Permisos** (`/permisos`) en el panel de administración. Se pueden crear roles nuevos,
editar los permisos de uno existente, y conceder o quitar permisos puntuales a una
persona.

Un permiso quitado a alguien **gana** sobre el mismo permiso concedido por su rol.

> ⚠️ **Antes de volver a sembrar los roles por defecto:** hacerlo sobrescribe los
> permisos de los roles predefinidos con los valores de fábrica, y se pierde cualquier
> permiso agregado a mano sobre ellos. Ya ocurrió en producción. Si personalizaste un rol
> predefinido, anótalo antes.

## Ver también

- [manual-administracion.md](manual-administracion.md) — cómo hacer las tareas del día a día
- [`README.es.md`](../../README.es.md) — qué es la plataforma y qué incluye
