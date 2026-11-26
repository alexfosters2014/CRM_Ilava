# WhatsApp Web con Baileys · operación y arquitectura

**Estado:** implementado para seguimiento de cobranza (envío y recepción) y envío individual desde Cobranza.
**Número:** una única cuenta uruguaya de la empresa, usada como dispositivo vinculado.

## 1. Alcance

| Flujo | Canal | Condición |
|---|---|---|
| Seguimiento de cobranza | WhatsApp real (Baileys) | El caso tiene celular y la sesión está conectada. |
| Seguimiento sin sesión | Registro manual (`wa.me`) | Se conserva como respaldo; no envía ni verifica. |
| Cobranza individual | WhatsApp con PDF | El servicio tiene celular cargado. |
| Cobranza masiva | Solo correo (SMTP) | No se envía WhatsApp masivo: riesgo de bloqueo. |

## 2. Requisitos antes de vincular

1. El número debe tener WhatsApp activo en un teléfono. Baileys se suma como **dispositivo vinculado**.
2. WhatsApp admite hasta **4 dispositivos vinculados** además del teléfono. Cada WhatsApp Web abierto ocupa uno. Revisar en el teléfono: *Dispositivos vinculados*.
3. El teléfono debe seguir existiendo y con batería: si queda apagado o sin la app por ~14 días, WhatsApp desvincula los dispositivos.
4. La cuenta es de la empresa: un bloqueo de WhatsApp deja a la empresa sin ese canal. No enviar masivos ni mensajes idénticos a decenas de números.

## 3. Puesta en marcha

1. Variables de entorno:
   ```env
   WHATSAPP_AUTH_DIR=.whatsapp-auth
   ```
   En el contenedor debe ser un volumen persistente (`crm-wa-auth`, ver `infra/compose-backend.yml`). Sin volumen, cada deploy pide QR de nuevo.
2. Levantar la API. La migración `0042` crea la tabla de sesión.
3. Entrar como **ADMIN** a *Configuración → WhatsApp → Conectar WhatsApp*.
4. Escanear el QR desde el teléfono: *WhatsApp → Dispositivos vinculados → Vincular un dispositivo*.
5. El QR se renueva cada ~20 segundos. La pantalla hace polling y se actualiza sola.

## 4. Arquitectura

- `servidor/src/lib/server/whatsapp/gestor.ts`: **un único socket** por proceso. El estado vive en `globalThis` para sobrevivir al HMR de Vite.
- `servidor/src/lib/server/whatsapp/ingesta.ts`: traduce `messages.upsert` a mensajes del CRM.
- `whatsapp_sesion`: fila única con estado (`DESCONECTADO`, `ESPERANDO_QR`, `CONECTADO`, `RECONECTANDO`, `CERRADO`).
- `whatsapp_mensajes`: espejo canónico, con `wa_id` único para deduplicar.
- `whatsapp_mensajes_seguimientos`: vínculo N:M; un mensaje puede estar en dos casos y desvincularse de uno sin borrar el original.

**Restricción crítica:** Baileys debe correr en **una sola instancia Node**. Dos procesos con las mismas credenciales pelean la identidad del dispositivo, se desvinculan entre sí y desincronizan las claves. El deploy actual (`node build` en un contenedor) cumple; PM2 cluster o réplicas no.

## 5. Lista blanca (qué se guarda y qué no)

- Cada seguimiento guarda un **snapshot** del celular del servicio al abrirse. Es editable; corregirlo borra la verificación anterior.
- Un mensaje se guarda **solo si su teléfono pertenece a un seguimiento no cerrado**. Cualquier otro se descarta sin guardar contenido.
- Los estados de cierre (`CERRADO_PAGADO`, `CERRADO_ACUERDO`, `CERRADO_LEGAL`, `CERRADO_INCOBRABLE`) sacan el número de la lista automáticamente: no hay tabla espejo que sincronizar.
- Si el mismo celular está en dos casos activos, el mensaje se registra en **ambos**. En el caso equivocado se usa **Quitar** en la burbuja: se desvincula y borra el evento de ese caso; el mensaje sigue en el otro.
- Solo se aceptan móviles uruguayos (`099 123 456`, `+598 99 123 456`, `00598…`). Los fijos (2xxx/4xxx) se rechazan.

## 6. Recepción

- WhatsApp puede identificar al contacto con un **LID** (id interno) en lugar del teléfono. El gestor resuelve `remoteJidAlt` o el store de Baileys; nunca asume que `remoteJid` es un teléfono.
- Los mensajes que el equipo escribe **desde el teléfono** llegan como `fromMe`: se registran como salientes con autor “Equipo (teléfono)”.
- El eco de un mensaje enviado por la API se descarta por `wa_id` (no se duplica).
- Entrante nuevo: crea el evento en el caso, actualiza última actividad y **notifica al responsable** en la campana.
- Grupos, estados, canales y difusiones se ignoran.
- No se descarga multimedia: se registra el tipo y el nombre del archivo, no el contenido.

## 7. Envío

### Canales del seguimiento

| Canal | Qué hace |
|---|---|
| **Correo (envía)** | Envía por Gmail a los mails registrados del servicio (precargados y editables). |
| **Correo manual** | No envía: registra la conversación. Se elige Enviado/Recibido. |
| **WhatsApp (envía)** | Envía por Baileys al celular del caso. |
| **WhatsApp manual** | No envía: registra la conversación. Se elige Enviado/Recibido. |

Los canales manuales crean solo el evento en la línea de tiempo (estado “Registrado”); no pasan por el socket ni actualizan `whatsapp_mensajes`.

### WhatsApp automático
- Con sesión conectada y celular: **Enviar por WhatsApp** (real, queda el evento con estado).
- Sin sesión o sin celular: **Abrir WhatsApp (manual)** con el número del caso precargado; el registro es manual y no verifica entrega.

### Cobranza
Modal de detalle → **WhatsApp → Enviar**:
- Genera el mismo estado de cuenta que el correo y lo manda como **PDF** con caption corto. Si Chrome no está disponible, manda el texto completo.
- Respeta “solo vencidos” cuando el modelo lo permite.
- Usa el período que se está viendo en el modal y **netea notas de crédito**: los saldos negativos son líneas del estado de cuenta y parte del total. Solo se excluyen los saldos en cero.
- Queda registrado en `whatsapp_mensajes` con origen `COBRANZA`.

## 8. Límites conocidos

- **No hay historial retroactivo.** WhatsApp no entrega el archivo de chats. Se ve lo que entra desde que el número está conectado; el sync inicial y los mensajes viejos (`append`) se ignoran salvo los de los últimos 10 minutos.
- **No es la API oficial.** Baileys usa WhatsApp Web; un uso agresivo puede bloquear el número. La alternativa oficial (Business Cloud API) tiene costo por mensaje.
- **Sin backfill por caso**: si el caso se abre después de la conexión, ve mensajes desde ese momento, no los anteriores.
- **Sin lock entre procesos**: la restricción de instancia única es operativa, no está coordinada en la base.
- **Importación de servicios**: la planilla no trae la columna de celular; por ahora se carga editando el servicio.
- **Sin edición del celular del caso desde la UI**: el PATCH lo soporta, pero no hay campo en el detalle.

## 9. Diagnóstico

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El QR no aparece y cierra con 428 | Tuple de navegador “Desktop” rechazado por WhatsApp (regresión oct-2026) | Ya se usa `Browsers.ubuntu('Chrome')`; no volver a “Desktop”. |
| `CERRADO` | WhatsApp desvinculó el dispositivo (logout remoto) | *Vincular de nuevo* y escanear QR. |
| `RECONECTANDO` persistente | Teléfono apagado, sin red o WhatsApp caído | Revisar el teléfono; el gestor reintenta con backoff hasta 12 veces. |
| “La sesión no está conectada” al enviar | Sesión caída | Avisar al ADMIN; el envío no se registra como enviado. |
| El mensaje entrante no aparece | Número sin caso activo, número no uruguayo o LID sin resolver | Verificar el celular del caso y que no esté cerrado. |

## 10. Archivos

- `servidor/src/lib/server/whatsapp/gestor.ts`
- `servidor/src/lib/server/whatsapp/ingesta.ts`
- `servidor/src/lib/server/repositorios/whatsapp.ts`
- `servidor/src/lib/server/repositorios/whatsapp-mensajes.ts`
- `servidor/src/lib/server/servicios/telefonos.ts`
- `servidor/src/lib/server/servicios/cobranza-whatsapp.ts`
- `servidor/drizzle/0042_whatsapp_sesion.sql`
- `servidor/drizzle/0043_whatsapp_telefonos.sql`
- `servidor/drizzle/0044_whatsapp_mensajes.sql`
- `cliente/src/lib/pantallas/Configuracion.svelte` (pestaña WhatsApp)
- `cliente/src/lib/pantallas/Seguimientos.svelte` (composer y chat)
- `cliente/src/lib/pantallas/Cobranza.svelte` (envío individual)
