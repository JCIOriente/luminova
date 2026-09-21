# Costos y continuidad

Para la Directiva, y sobre todo para la que viene. Responde dos preguntas:
**¿cuánto cuesta sostener esto?** y **¿qué pasa si quien lo mantiene deja el capítulo?**

## Costos

### Lo que sí está verificado

La **infraestructura de despliegue** no cuesta nada, y esto se puede afirmar con
certeza porque está documentado en el repositorio (`docs/ci-cd.md`, sección 10):

| Concepto | Costo |
|---|---|
| GitHub Actions (automatización) | **Gratis** — el repositorio es público, minutos ilimitados |
| Autenticación de despliegue (WIF / STS) | **Gratis**, siempre, en Google Cloud |
| Canales de vista previa | Insignificante — expiran solo en 1 día |
| Imágenes de las funciones en Artifact Registry | Único costo recurrente, y es chico |

Las imágenes de las funciones se acumulan con cada despliegue. Es anterior a la
automatización — un despliegue manual hace exactamente lo mismo.

### El único riesgo real de facturación

Un **bucle descontrolado** en una función de la nube. Si una función se dispara a sí
misma en cadena por un error de programación, el consumo puede crecer rápido.

Dos protecciones recomendadas, ambas de configuración única:

1. Una **alerta de presupuesto** en el proyecto `jci-oriente` de Google Cloud.
2. Una **política de limpieza** en Artifact Registry, para conservar solo las últimas N
   imágenes.

> **Recomendación:** configurar la alerta de presupuesto. Es gratis, toma diez minutos y
> es la única defensa contra una sorpresa.

### Datos pendientes

> **Requiere acceso a la consola de facturación de Firebase.** Quien tenga acceso puede
> completar esta sección:
>
> - **Plan actual:** ¿Spark (gratuito) o Blaze (pago por uso)?
> - **Gasto mensual real** de los últimos 3 meses.
> - **¿Existe una alerta de presupuesto** configurada en el proyecto `jci-oriente`?
> - **Dominio propio:** ¿se paga alguno, o se usan los subdominios `.web.app`?
>
> Estos datos no están en el repositorio y no se pueden deducir del código.

Lo que sí se puede anticipar: el uso de Firebase (base de datos, almacenamiento,
funciones) para un capítulo de este tamaño se ubica típicamente dentro o cerca del nivel
gratuito. Las fotos en almacenamiento son lo que más crece con el tiempo.

---

## Continuidad

La pregunta incómoda: **si mañana la persona que mantiene la plataforma deja el
capítulo, ¿qué pasa?**

### Lo que está bien resuelto

**No existe ninguna clave de despliegue guardada.** Ni en GitHub, ni en la computadora
de nadie. El sistema usa credenciales temporales que se generan en cada despliegue y
duran alrededor de una hora. No hay nada que rotar ni nada que se pueda filtrar y seguir
sirviendo.

**Ningún despliegue a producción ocurre sin aprobación humana.** Cada uno se detiene a
esperar que una persona autorizada lo apruebe con un clic.

**El código es abierto, con licencia Apache 2.0.** Está en
[github.com/JCIOriente/luminova](https://github.com/JCIOriente/luminova). El capítulo no
depende de un proveedor ni de una persona para seguir teniéndolo.

**Los datos son del capítulo**, en su propio proyecto de Google. Nada se borra en duro:
las bajas son lógicas y el historial se conserva entre gestiones.

**Está documentado.** Arquitectura, modelo de datos, despliegue, decisiones de diseño y
guía para contribuir están en el repositorio. Un desarrollador que no conoce el proyecto
puede levantarlo siguiendo el instructivo.

### Los riesgos reales

**1. Factor bus.** Es el riesgo principal. Conviene que al menos **dos personas** tengan:

- Acceso de administrador a la consola de Firebase / Google Cloud
- Permiso de administración en la organización de GitHub
- Capacidad de aprobar despliegues a producción
- Una cuenta con rol **Administrador** en la propia plataforma

Si hoy esa lista es una sola persona en cualquiera de los cuatro puntos, es lo primero
que hay que corregir. **No requiere presupuesto: requiere una decisión.**

**2. Cambios de la directiva.** Cada año cambian las personas y, con ellas, quién tiene
acceso. Conviene incorporar al traspaso una revisión de los cuatro accesos de arriba.

**3. Conocimiento técnico.** Mantener la plataforma requiere alguien que programe. El
capítulo no necesita tenerlo en planta —el código es abierto y está documentado— pero sí
necesita saber a quién recurrir. Al ser abierto, otro capítulo o un voluntario externo
puede colaborar.

### Checklist de traspaso

Al cambiar de directiva, verificar y dejar registrado:

- [ ] Quiénes tienen acceso de administrador en Firebase / Google Cloud
- [ ] Quiénes pueden aprobar un despliegue a producción
- [ ] Quiénes tienen rol **Administrador** dentro de la plataforma
- [ ] Quién es el contacto técnico, y quién es el suplente
- [ ] Dar de baja los accesos de quienes salen de la directiva
- [ ] Confirmar que la alerta de presupuesto sigue activa
- [ ] Inicializar las reglas de puntos de la nueva gestión
      (ver [manual-administracion.md](manual-administracion.md), punto 7)

Vale la pena hacerlo el mismo día del traspaso. Un acceso que nadie tiene es tan
problemático como uno que quedó abierto de más.

## Ver también

- [manual-administracion.md](manual-administracion.md) — operación del día a día
- [impacto.md](impacto.md) — qué puede reportar el capítulo
- [`docs/ci-cd.md`](../ci-cd.md) — el detalle técnico del despliegue (en inglés)
