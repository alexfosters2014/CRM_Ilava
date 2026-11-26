# Centro de seguimiento de cobranza · decisiones y pendientes

**Versión:** 0.1 · **Fecha:** 16/11/2026
**Especificación:** prompt maestro v0.3
**Implementación:** ruta `/seguimientos`, API `/api/seguimientos`, migración `0037_seguimientos`

## Implementado en esta etapa

### Modelo de datos

- `seguimientos`: caso con código anual `SEG-AAAA-NNNNNN` (secuencia propia), servicio,
  área, título, motivo, estado principal, prioridad, responsable, canal preferido,
  apertura/cierre, última actividad y `version` para concurrencia optimista.
- `seguimientos_facturas`: una fila por comprobante asociado, con saldo al asociar,
  fecha/Usuario de asociación y retiro lógico con motivo. Nunca se borra el historial.
- `seguimientos_eventos`: línea de tiempo única de todos los canales (nota, correo,
  WhatsApp manual, llamada, reunión, estado, tarea, promesa, ticket, factura, sistema).
- `seguimientos_tareas`: próxima gestión con tipo, fecha/hora, responsable, recordatorio,
  estado, resultado, reprogramación y cancelación.
- `seguimientos_promesas`: fecha comprometida, importe, moneda, facturas, medio de pago,
  contacto que confirmó, canal, estado y confirmación manual auditada.
- `seguimientos_tickets`: referencia al ticket transversal, con marca de bloqueo y motivo.
- `seguimientos_correos`: correos con ids de proveedor (`gmailMessageId`, `threadId`,
  `historyId`), `Message-ID`, `In-Reply-To`/`References`, estado de vinculación y bandeja
  de pendientes.
- `seguimientos_participantes`, `seguimientos_lecturas` y
  `seguimientos_notificaciones` para colaboración, no leídos y avisos.

### Gmail API (OAuth 2.0)

- Tabla `gmail_cuentas` con refresh/access tokens cifrados (AES-256-GCM), scope,
  `historyId`, última sincronización y último error.
- Conexión desde Configuración › Correo: consentimiento, callback con `state` firmado,
  verificación, sincronización y desconexión.
- Envío real desde seguimientos y tickets con MIME `raw`, `Message-ID` propio, asunto
  `[SEG-...]`/`[TCK-...]`, `threadId` y `Reply-To` con plus-addressing
  (`seguimiento+SEG-...@dominio`).
- Recepción por sondeo: `history.list` con cursor y fallback a `messages.list`; dedupe por
  id de Gmail; vinculación por hilo → headers → alias → asunto; bandeja de pendientes si no
  hay coincidencia segura.
- SMTP queda intacto para los envíos masivos de Cobranza. Guía completa en `GMAIL-API.md`.

### Reglas aplicadas

- Varios seguimientos activos por servicio, con historial independiente y selector en el
  detalle.
- Las facturas se asocian **individualmente** y solo las elige el usuario; una factura
  nueva de la cartera no entra sola.
- Saldo dinámico: se resuelve contra la última aparición del comprobante en la cartera
  (misma clave de origen). Si ya no figura, el saldo es cero y la factura queda pagada.
- Ver: cualquier usuario con la pantalla `seguimientos`. Editar: ADMIN, área `TODOS` o
  usuarios del área del caso. Los observadores de otra área ven el caso en solo lectura.
- Cerrar exige motivo y se bloquea si hay un ticket bloqueante abierto. Reabrir vuelve a
  `EN_SEGUIMIENTO` y deja evento de auditoría.
- Un caso cerrado no admite avances, tareas ni promesas hasta reabrirlo.
- Los cambios de estado, prioridad, responsable, facturas, tareas, promesas, tickets y
  correos generan eventos con usuario, fecha y hora.
- Concurrencia optimista por `version`; la pantalla avisa cuando otro usuario modificó el
  caso y permite recargar.

### Pantalla `/seguimientos`

- Panel izquierdo de servicios en seguimiento con urgencia (gestión vencida, promesa
  incumplida, promesa de hoy, ticket bloqueante, mayor atraso), saldos por moneda, último
  contacto, próxima acción, no leídos y chip de estado.
- Filtros por texto (cliente, servicio, RUT/CI, SEG, factura, responsable), estado,
  responsable, canal, prioridad, ticket, próxima acción, moneda y no leídos.
- Cabecera del caso con estado, prioridad y responsable editables, observadores, resumen
  de saldos, facturas, promesa, tickets, último contacto y próxima gestión.
- Pestañas **Historial** y **Facturas**. El historial es una conversación con separadores
  por fecha, notas internas, respuestas entrantes, eventos del sistema y referencias de
  tickets. El compositor permite nota, correo, WhatsApp manual, teléfono, reunión u otro.
- Tickets: tarjeta de referencia con "Ver ticket" (modal de solo lectura) y acceso al
  Centro de tickets. Crear ticket vinculado transfiere servicio, seguimiento y facturas.
- Facturas: totales, tabla con saldo/aging/estado, alta de comprobantes del servicio,
  retiro con motivo y envío de vencidas por correo (registro en historial).
- Estados vacíos, carga con esqueletos, error con reintento, conflicto de edición y
  notificaciones internas.

### Integración con Cobranza

- Chip clickeable por servicio con seguimiento activo (estado, SEG, tickets bloqueantes y
  alerta de gestión vencida) que abre el caso.
- Botón **Crear seguimiento** en el modal de detalle. Usa los comprobantes incluidos (y
  respeta "Enviar solo vencidos"), advierte si ya hay casos activos y permite abrir uno
  existente. Al crear, abre el Centro en el caso nuevo.
- Tras un envío real de estado de cuenta, el correo se registra automáticamente en los
  seguimientos activos que cubren alguna de las facturas enviadas, con asunto,
  destinatarios, plantilla y estado del envío.

## Decisiones aplicadas del prompt v0.3

| # | Tema | Decisión aplicada |
|---|---|---|
| 1 | Permisos | Pantalla `seguimientos`; edición por área del caso; ADMIN y área TODOS sin restricción; observadores de otras áreas en solo lectura. La configuración de "área de cobranza" queda pendiente. |
| 2 | Estados finales | Se conservan los nueve estados del prompt. "Próxima gestión" es una tarea y el estado del ticket nunca se copia al caso. |
| 3 | Correo | Cobranza sigue por SMTP. Los seguimientos y tickets envían por Gmail API cuando hay una cuenta conectada; sin cuenta, el correo se registra sin enviarse. |
| 4 | Casillas | Cuentas Gmail Workspace conectadas por OAuth con alias de Reply-To por seguimiento. Las casillas SMTP de cobranza siguen independientes. |
| 5 | WhatsApp | Manual: enlace `https://wa.me/numero?text=...`, confirmación "¿Se envió?" y registro manual como gestión. No se automatiza ni se lee WhatsApp Web. |
| 6 | Notificaciones | Internas en la app, con deduplicación por evento. El correo de notificación queda pendiente. |
| 7 | Promesa cumplida | Confirmación manual auditada con resultado y detalle. No hay conciliación automática. |
| 8 | Facturas | Siempre el grupo elegido; se pueden incorporar o retirar después con fecha y usuario. |
| 9 | Mis seguimientos | No se creó una bandeja personal: la vista es global. |
| 10 | Cerrar/reabrir | Cualquier usuario del área del caso (o ADMIN/TODOS). |
| 11 | Adjuntos | No se adjuntan archivos en esta versión. Los correos y eventos guardan metadatos, no binarios. |

## Pendientes explícitos

1. **Autenticación OIDC del push de Pub/Sub**: hoy el push se autentica con un secreto
   largo en el path; la validación OIDC y la rotación automática quedan para después. El
   watch y la recepción en tiempo real ya están implementados (ver `GMAIL-API.md`).
2. **Adjuntos y PDF desde el Centro**: el correo sale por Gmail API, pero el estado de
   cuenta con PDF se sigue enviando desde Cobranza. El compositor no adjunta archivos.
3. **Notificaciones por correo** y preferencia por usuario (hoy son internas).
4. **Área de cobranza configurable** en Configuración y visores por ticket.
5. **Bloqueo por factura** (estado `BLOQUEADA`) y su motivo; hoy el bloqueo es a nivel de
   ticket del caso.
6. **SSE/WebSocket**: la actualización es por sondeo cada 15 s, igual que Tickets.
7. **Permisos granulares** por acción dentro de la pantalla: el detalle del ticket y las
   casillas Gmail ya están acotados por participación/área; faltan permisos por acción
   (crear, cerrar, vincular correos) configurable por rol.
8. **Verificación pública de Google** si la app deja de ser interna del Workspace.

## Correcciones aplicadas (revisión de consistencia, 16/11/2026)

- **IDs de facturas en tickets y promesas**: la UI manda `comprobanteId` y el
  servidor valida existencia y pertenencia al servicio. Antes el ticket podía
  referenciar facturas de otro servicio.
- **Eventos ticket → seguimiento**: nuevo `repositorios/tickets-seguimiento.ts`
  refleja cambios de estado, asignación, resolución y respuestas de correo como
  eventos resumidos, notifica al responsable y observadores, y desbloquea el
  caso restaurando el estado anterior cuando el ticket cierra.
- **Tareas `REVISAR_TICKET`**: se completan al cerrarse el ticket vinculado, no
  al crearlo.
- **Cierre con gestiones pendientes**: se rechaza con `TAREAS_PENDIENTES` (409).
- **Vínculo visible en Tickets**: `TicketDetalle` expone `seguimiento` con
  código y enlace al caso; el ticket se puede abrir directo con
  `/tickets?ticket=TCK-...`.
- **Detalle del ticket por participación**: el modal de consulta desde cobranza
  exige participar del ticket (la tarjeta de referencia sigue visible para el
  caso).
- **Casillas Gmail por área**: `gmail_cuentas.area_id` acota cuentas y bandeja
  de sin vincular; ADMIN y área TODOS ven todas.
- **Motivo de bloqueo obligatorio** al crear un ticket bloqueante por API.
- **Concurrencia**: envío Gmail y vínculo de ticket actualizan `version` con
  guarda optimista.
- **FKs de eventos** (`correo/tarea/promesa/ticket`) y etiquetas en español de
  estados/prioridades de ticket en la pantalla de seguimiento.

## Verificación realizada

- `svelte-check` 0 errores / 0 advertencias en `servidor` y `cliente`.
- 141 tests del servidor en verde (incluye matcher de Gmail y MIME); build de producción de
  ambos proyectos OK.
- Migraciones `0037`, `0038` y `0039` aplicadas en desarrollo (40 migraciones) con `journal`
  actualizado.
- Flujo real contra la API: alta con dos comprobantes, nota, llamada, promesa, ticket
  bloqueante, tarea completada, cierre rechazado por ticket, cierre de un caso sin
  bloqueo, historial con casos cerrados, botón Reabrir visible, chip en cartera y alta
  desde Cobranza con advertencia de duplicados.
- Gmail: OAuth de inicio y callback verificados (redirección externa, estado inválido y
  cancelación), panel de Configuración con y sin credenciales, y envío rechazado con
  cuenta inexistente. Sin credenciales reales no se puede probar el envío contra Google.
- Tiempo real: `users.watch`, renovación y endpoint Pub/Sub implementados; el push se probó
  con secreto incorrecto (404), cuenta desconocida (200 ignorado) y payload inválido (400).
- Consistencia seguimiento-ticket: reproducido y verificado el flujo completo: facturas del
  ticket con el comprobante correcto, vínculo expuesto en el detalle del ticket, bloqueo y
  desbloqueo automático con restauración de estado, evento resumido en el historial, tarea
  `REVISAR_TICKET` completada al cancelar el ticket, cierre rechazado con gestiones
  pendientes (409) y promesa aceptada con `comprobanteId`.
- Datos de prueba eliminados al terminar; la bandeja arranca vacía.
