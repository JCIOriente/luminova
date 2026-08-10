# Luminova

**Plataforma de reconocimiento de membresía para capítulos de JCI.** Los miembros suman
puntos por participar. El capítulo obtiene un registro permanente y auditable de quién
hizo qué.

[![CI](https://github.com/JCIOriente/luminova/actions/workflows/ci.yml/badge.svg)](https://github.com/JCIOriente/luminova/actions/workflows/ci.yml)
[![Licencia: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node 24](https://img.shields.io/badge/node-24-green.svg)](.nvmrc)

Desarrollado y en uso en [JCI Oriente](https://jcioriente.web.app), el capítulo de Santa
Cruz de la Sierra de Junior Chamber International. Abierto para que cualquier capítulo lo
use o lo adapte.

> **Esta es la versión resumida en español.** Cubre qué es, qué problema resuelve, qué
> hace hoy y cómo adaptarlo a tu capítulo. La documentación técnica —stack, instalación
> local, despliegue y cómo contribuir— está en el [README en inglés](README.md), que es la
> versión que se mantiene al día. Se hizo así a propósito: una traducción completa se
> desactualiza en dos pull requests.

## El problema

Un capítulo de voluntarios no tiene registro de quién asistió. La asistencia vive en un
grupo de WhatsApp, en una hoja impresa o en la memoria de nadie. Al final de la gestión el
reconocimiento termina midiendo quién fue más visible, no quién más aportó. El cambio de
directiva borra lo poco que se llevaba, porque vivía en las planillas de la directiva
saliente. Los miembros que sí trabajaron dejan de venir, en silencio.

Luminova cierra ese ciclo. La asistencia se captura en la puerta, los puntos se derivan de
una regla que el capítulo acordó de antemano, y el registro sobrevive al cambio de
gestión.

## Cómo funciona

1. La directiva crea un **programa** o **proyecto**, y las **actividades** que dependen de él.
2. En la puerta, un escáner registra a los miembros por **código QR**. Hay registro manual
   para cuando se queda sin batería un teléfono.
3. Una Cloud Function deriva los **puntos** según la matriz de la gestión: distinto valor
   por dirigir, codirigir, integrar el equipo o asistir.
4. La **clasificación** y los perfiles se actualizan. Los puntos quedan *provisionales*
   hasta que el director presenta el informe final; ahí se confirman.

Tres superficies:

| Aplicación | Qué es | En vivo |
|-----|------|------|
| `apps/spotlight` | Sitio público — programas, galería de impacto, directiva, formulario de contacto | https://jcioriente.web.app |
| `apps/backstage` | Panel administrativo — todo lo anterior, requiere autenticación | https://jcioriente-backstage.web.app |
| `apps/beacon` | Cloud Functions — el motor de reconocimiento y las proyecciones públicas | — |

## Características

Todo lo que sigue existe hoy en el código. Lo planificado está aparte, en la
[Hoja de ruta](#hoja-de-ruta).

**Motor de reconocimiento**

- Cada check-in genera una fila en el libro de participaciones. El acumulado por gestión se
  recalcula dentro de una transacción, así que escaneos simultáneos en una puerta con
  movimiento no pierden puntos.
- Matriz fija de códigos de puntaje por gestión (dirección, codirección, equipo, asamblea,
  curso, evento nacional, aniversario, roles de trainer, entre otros). Los puntos se editan
  por gestión, pero no se agregan filas: los códigos son un enum, no reglas libres.
- Editar un valor no es retroactivo. Cada fila del libro guarda el puntaje con el que se
  otorgó.
- Los puntos son provisionales hasta que el asistente de cierre de la iniciativa registra el
  informe final.

**Asistencia**

- Check-in por QR con modal de escaneo, registro manual de respaldo, lista en vivo,
  porcentaje de asistencia y deshacer para escaneos equivocados.
- La ventana de check-in se limita al día local (Bolivia) de la actividad. Un Admin puede
  registrar con fecha anterior.
- La hora de inicio y la categoría de una actividad se bloquean apenas existe un check-in.

**Miembros y gobernanza**

- Consola de miembros: crear, editar, eliminar de forma lógica (nunca se borra en duro),
  foto de perfil, historial de puntos y de participaciones.
- Catálogo de cargos: comité ejecutivo, direcciones de la gestión y comisiones permanentes,
  con títulos según género y un mapa de asignaciones por gestión que conserva la historia
  entre cambios de directiva.
- Alta de acceso por invitación. No hay registro público.
- Panel del miembro con sus puntos, su posición, su historial y su credencial QR personal.

**Roles y permisos**

- Permisos gruesos `acción:Sujeto` en un custom claim de Firebase, resueltos desde las
  definiciones de rol más las excepciones por miembro.
- Los roles se editan en tiempo real desde una pantalla de administración: un capítulo puede
  definir los suyos sin desplegar.
- Cada control del cliente está replicado en `firestore.rules`, y hay una prueba que
  verifica que la navegación y las reglas coincidan. Un rol definido solo con permisos nunca
  alcanza las pantallas que emiten permisos.

**Sitio público**

- Inicio, nosotros (historia, misión, directiva actual), galería de impacto por proyecto,
  página de enlaces, páginas legales.
- El sitio público nunca carga el SDK completo de Firebase. Lee un conjunto acotado de
  proyecciones públicas con el cliente ligero de Firestore. Las colecciones privadas no son
  alcanzables desde ahí.
- El formulario de contacto genera prospectos que se gestionan desde el panel.
- El contenido —estadísticas, línea de tiempo, misión, datos de contacto, redes— lo edita
  la presidencia desde una pantalla de administración. Cambiar los textos del sitio no
  requiere desplegar.

**Plataforma**

- Ambas aplicaciones se instalan como PWA.
- Redactor de notificaciones con reparto a una bandeja de entrada y push web de mejor
  esfuerzo.
- Firebase App Check (reCAPTCHA v3) en ambas aplicaciones.
- Alrededor de 250 archivos de prueba, incluidas las suites de reglas de seguridad de
  Firestore y Storage que corren contra el emulador.
- CI en cada pull request. Despliegue continuo al hacer merge, sin credenciales
  almacenadas y con aprobación manual.

## Hoja de ruta

No está construido. Se lista porque los cimientos se ven en el código y la gente pregunta.

- **Tesorería y cuotas.** Existe un rol `Treasury` con su disposición en el panel, pero no
  hay libro de cuotas, ni registro de pagos, ni baja automática de estado por mora. Es la
  pieza faltante más grande.
- **Pantalla de configuración.** Todavía no hay ruta `/settings`; perfil, tema y ajustes de
  la organización están repartidos en otras pantallas.
- **Exportación de expedientes para premios JCI.** Los proyectos están estructurados para
  convertirse en postulaciones, pero la exportación está frenada por criterios de premiación
  que aún no tenemos.

El panorama completo está en [`docs/roadmap.md`](docs/roadmap.md) (en inglés).

## Adoptarlo para tu capítulo

Luminova no es multi-inquilino. Un despliegue sirve a un capítulo. Para usarlo en el tuyo,
haz un fork y cambia esto:

1. **Proyecto de Firebase.** Crea el tuyo, y luego en `.firebaserc` ajusta el id del
   proyecto por defecto y **los tres grupos de destinos**: `hosting` (ambos sitios) y
   `storage` (el destino `default`, al que `firebase.json` apunta para `storage.rules`).
   Si te saltas el destino de storage, `pnpm deploy:rules` falla o sigue apuntando al
   bucket de otro capítulo, y el tuyo queda sin reglas. Después ajusta la configuración del
   cliente en `apps/*/.env.local.example` y `apps/*/.env.production`.
2. **Contenido del capítulo.** El contenido inicial del sitio —historia, misión, visión,
   valores, estadísticas, datos de contacto— vive en
   `tools/scripts/lib/site-config-seed-data.mjs` y
   `apps/spotlight/src/site-config/defaults.ts`. Todo eso también se edita desde la pantalla
   `/config` una vez que esté funcionando.
3. **Marca.** Está en más lugares de los que parece, y omitir uno se ve en público:
   - Logos en `packages/ui/src/assets/`; tokens de diseño en `packages/ui`.
   - Favicons, iconos PWA e iconos de Apple en **ambos** `apps/spotlight/public/` y
     `apps/backstage/public/`, más las imágenes para compartir `og-image-v2.png` y
     `og-linktree.png`.
   - El `name` / `short_name` de la PWA en `apps/spotlight/vite.config.ts` y
     `apps/backstage/vite.config.ts` — es el nombre con el que la app se instala en el
     teléfono.
   - El título por defecto de las notificaciones en ambos
     `public/firebase-messaging-sw.js`.
   - El `https://jcioriente.web.app` fijo en `apps/spotlight/index.html` (`rel=canonical`,
     `og:url`, `og:image`, `twitter:image`), `apps/spotlight/public/sitemap.xml` y
     `apps/spotlight/public/robots.txt`. Si los dejas, tu sitio le declara a los buscadores
     que es una copia del nuestro, y cada vez que alguien comparta el enlace por WhatsApp
     saldrá nuestra imagen.

   Las marcas de JCI **no** están cubiertas por la licencia de este repositorio — ver
   [NOTICE](NOTICE).
4. **Matriz de puntos.** Los valores por defecto siguen la evaluación "Mejor Miembro
   Individual" de JCI Oriente (`docs/reference/points-matrix.md`). Los valores se editan por
   gestión desde `/point-rules`. Los *códigos* de las reglas son un enum en
   `@luminova/types`: cambiar qué actividades puntúan es un cambio de código.
5. **Arranque.** `pnpm seed:production` crea el primer administrador de forma interactiva y
   carga la configuración inicial del sitio. Se niega a correr contra los emuladores.

Los pasos técnicos de instalación local están en el
[README en inglés](README.md#quickstart) y en [CONTRIBUTING.md](CONTRIBUTING.md).

**Sobre el idioma.** La interfaz está en español, porque el capítulo lo está. Los
identificadores del código son en inglés, y los textos visibles todavía no están extraídos
para traducción: un capítulo que necesite otro idioma tendría que hacer ese trabajo. Si lo
estás evaluando,
[abre un issue de adopción](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml)
y cuéntanos; nos ayuda a priorizar.

## Contribuir

Las contribuciones son bienvenidas, tanto de capítulos como de desarrolladores. Empieza por
[CONTRIBUTING.md](CONTRIBUTING.md) (en inglés) para instalación, convenciones y el gate de
calidad.

- Errores y propuestas: [Issues](https://github.com/JCIOriente/luminova/issues)
- Dudas de instalación y adopción: [Discussions](https://github.com/JCIOriente/luminova/discussions)
- Seguridad: en privado, según [SECURITY.md](SECURITY.md) — nunca un issue público

Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).

## Licencia

[Apache License 2.0](LICENSE).

La licencia cubre el código. No otorga derechos sobre el nombre ni las marcas de JCI, ni
sobre los logos de JCI Oriente en `packages/ui/src/assets/`, ni sobre el contenido propio
del capítulo que se distribuye como datos iniciales. Lee [NOTICE](NOTICE) antes de hacer un
fork.

## Origen

Luminova nació en **JCI Oriente** —Junior Chamber International, Santa Cruz de la Sierra,
Bolivia— para resolver nuestro propio problema de reconocimiento, y lo mantiene el Comité
de Innovación del capítulo.

Es de código abierto porque todos los capítulos tienen este problema y ninguno debería
tener que resolverlo dos veces. Si lo adaptas, nos gustaría saberlo.
