# Centro de tickets · decisiones y pendientes

**Versión:** 0.2 · **Fecha:** 16/11/2026
**Prototipo visual:** `PROTOTIPO-TICKETS.html` (datos ficticios, 14 variantes)
**Implementación:** ruta `/tickets`, API `/api/tickets`, migraciones `0034`-`0036`

## Implementado en esta etapa

- Tablas `tickets`, `ticket_categorias`, `ticket_participantes`, `ticket_mensajes`,
  `ticket_eventos`, `ticket_correos`, `ticket_lecturas` y `ticket_notificaciones`.
- Numeración continua con secuencia propia (`TCK-000001`).
- Visibilidad por participación: creador, área responsable, asignado, áreas y usuarios
  mencionados; un ADMIN ve todo. Tener acceso a Servicios no alcanza.
- Alta vinculada a servicio o interna, participantes, menciones, mensajes, eventos de
  auditoría, notificaciones con deduplicación y concurrencia optimista por `version`.
- Reglas aplicadas: resolución obligatoria para Resuelto, motivo para espera/cierre/
  cancelación, cierre solo del creador, validación por cualquier participante y ticket
  cerrado en modo lectura.
- Correo saliente con la cuenta SMTP configurada, asunto `[TCK-...]`, leyenda de menciones,
  `threadId` local y `Message-ID`. Webhook entrante protegido por secreto en
  `/api/webhooks/tickets/[id]/correo`.
- Pantalla `/tickets` chat-first con lista filtrable, detalle, contexto, auditoría, correo,
  notificaciones, creación guiada y estados de carga/error/vacío.

La conexión real con Gmail (OAuth, watch y mapeo de hilos) sigue pendiente: el webhook ya
existe, pero hay que configurar el conector y el secreto `TICKETS_EMAIL_WEBHOOK_SECRET`.

## Decisiones cerradas

| # | Tema | Decisión aplicada |
|---|---|---|
| 1 | Responsabilidad mínima | El ticket exige un área responsable o un usuario referente. Además, o se vincula a un servicio, o se identifica como interno. No existe una bandeja central «sin clasificar». **Interpretación del prototipo:** exige área responsable y deja el usuario asignado como opcional. |
| 2 | Cierre | Solamente el creador del ticket puede cerrarlo. El resto de los participantes puede validar la solución. |
| 3 | Validación | Cualquier usuario involucrado puede validar un ticket en estado Resuelto. Validar no es cerrar. |
| 4 | Mención de área | Notifica a todos los integrantes activos del área y la agrega a «Áreas involucradas». No asigna el ticket a cada persona. |
| 5 | Responsabilidad | Una sola área responsable inicial; las demás áreas quedan involucradas por mención. |
| 6 | Fecha límite | Opcional y definida por el creador según la urgencia. Por defecto no hay fecha límite. |
| 7 | Áreas iniciales | No se define un seed de áreas en esta etapa. El prototipo usa áreas de ejemplo. |
| 8 | Categorías | Configurables por administradores. Se admite un seed inicial de categorías. |
| 9 | Visibilidad de tickets vinculados | Solo los participantes del ticket. Tener acceso al servicio no alcanza. |
| 11 | Numeración | Continua: `TCK-000001`, sin reinicio anual. |
| 12 | Reapertura | Un ticket cerrado no admite respuestas. Para continuar se crea un ticket nuevo con referencia al cerrado. |

## Canal de correo (requisito nuevo)

Cada ticket puede enviar y recibir correo desde el dominio propio de la empresa:

- Se guarda el identificador del hilo y los `Message-ID` necesarios para ubicar la cadena.
- Las respuestas se incorporan al historial del ticket con fecha y hora.
- Cada correo incluye al pie la leyenda con las menciones disponibles.
- El sistema detecta las menciones escritas en la respuesta, incorpora el área o usuario
  y dispara las notificaciones correspondientes, sin duplicar avisos.
- Un correo entrante no crea un ticket nuevo: se asocia al hilo existente.

La implementación muestra este flujo en el detalle del ticket (pestaña **Correo**), en el
modal **Enviar correo** y en los eventos de la conversación. El webhook entrante ya está
implementado; falta conectar el proveedor y configurar su secreto.

## Pendientes para completar

1. **Implementación de Gmail.** Definir Gmail API con OAuth y watch por Pub/Sub, o IMAP/SMTP.
   Recomendación: Gmail API con una cuenta de servicio y `gmail.modify` + `gmail.readonly`,
   más un watch renovable. Requiere administración de Google Workspace y consentimiento.
   *Sin esta decisión no se puede prometer la ingesta automática de respuestas.*
2. **Dirección de correo por ticket.** Una sola casilla `tickets@dominio` con `threadId`
   y cabeceras, o alias por ticket (`ticket-241@dominio`). Recomendación: alias por ticket
   para ruteo confiable; conservar igualmente `threadId` y `Message-ID`.
3. **Remitentes externos.** Cómo mapear un correo entrante a un contacto o usuario.
   Recomendación: contactos externos identificados; remitentes desconocidos quedan como
   «externo» y no obtienen permisos internos automáticamente.
4. **Seguridad de menciones por correo.** Un remitente externo que escribe `@Administración`
   ¿puede otorgar acceso? Recomendación: solo las menciones de participantes autorizados
   otorgan acceso; las externas se registran pero no autorizan.
5. **Adjuntos entrantes.** La v1 no muestra ni acepta adjuntos. Definir si un correo con
   adjuntos se incorpora igual (recomendado) y se agrega una nota de sistema.
6. **Recordatorios de vencimiento.** Al no haber fecha límite por defecto, definir el umbral
   de aviso (por ejemplo, 24 h antes y al vencer) y quién lo recibe.
7. **Tickets resueltos.** Confirmar si admiten respuestas mientras esperan validación.
   Recomendación: sí; solo el estado Cerrado bloquea la conversación.
8. **Edición de comentarios.** Definir si se permite, durante cuánto tiempo y cómo se expone
   la versión anterior en auditoría.
9. **Matriz de permisos.** El prototipo aplica «cierra solo el creador» y «valida cualquier
   involucrado». Falta formalizar quién puede cambiar área, prioridad, asignación y fecha límite.
10. **Privacidad del hilo.** Confirmar que todos los participantes del ticket ven el hilo
    completo, incluidas las direcciones externas y las respuestas del cliente.
11. **Zona horaria y formato.** Se usa `dd/mm/aaaa` y 24 horas, hora de Uruguay.
12. **Límite de la v1.** Sin adjuntos, sin jerarquía compleja de tickets, sin reapertura
    automática y sin bandeja central de clasificación.
13. **Área responsable vs usuario referente.** La decisión 1 admite «área o usuario referente».
    El prototipo exige un área responsable y deja el usuario asignado como opcional. Confirmar
    si un ticket puede existir únicamente con un usuario referente, sin área.

## Brechas de esta primera implementación

- La **entrada desde Cobranza** («Crear ticket» / «Ver ticket» en el seguimiento) todavía no
  está cableada dentro de `Cobranza.svelte`; el módulo ya recibe tickets vinculados a servicio.
- La **administración de categorías** tiene tabla y seed, pero falta la pantalla de CRUD para
  administradores.
- Los **permisos son por pantalla** (`tickets`). Falta la matriz granular por acción
  (cambiar área, prioridad, asignar, fecha límite) más allá de las reglas de cierre/validación.
- El **tiempo real** es polling cada 12 s con detección de versión; no hay SSE/WebSocket.
- El **conector de Gmail** (OAuth, watch y mapeo de hilos) está pendiente. El webhook de
  ingesta y el correo saliente ya existen.
- Filtros avanzados (involucrado, asignado, rangos de fecha) y relación de tickets desde la
  interfaz quedan para una segunda pasada.

## Fuera de alcance explícito en v1

- Archivos adjuntos (no hay botones, zonas de arrastre ni iconos).
- Múltiples áreas responsables simultáneas.
- Reapertura automática por respuesta.
- Tickets visibles para todo el que tenga acceso al servicio.
- Aprobación o cierre por cualquier integrante del área.

## Nota de implementación

Este documento y el prototipo son material de diseño. No hay migraciones, endpoints,
permisos reales, tiempo real ni integración con Gmail implementados todavía. La base de datos
propuesta conserva las entidades de la sección 20 del prompt maestro: ticket, referencia,
participante, mensaje y evento.
