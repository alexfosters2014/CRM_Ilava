# Gmail API con OAuth · guía de configuración y arquitectura

**Estado:** implementado para seguimientos y tickets.
**Correo de cobranza:** sigue saliendo por SMTP (sin cambios).

## 1. Decisión de arquitectura

| Flujo | Canal | Motivo |
|---|---|---|
| Estados de cuenta masivos de Cobranza | SMTP con app password | Ya funciona, envía PDF y no necesita leer respuestas. |
| Correo de seguimientos | Gmail API (`gmail.send` + `gmail.readonly`) | Necesita `threadId`, `Message-ID` y leer la respuesta en el mismo hilo. |
| Correo de tickets | Gmail API si hay una cuenta conectada; SMTP como fallback | Misma razón: hilo y lectura. |

Una cuenta SMTP y una cuenta Gmail pueden convivir. El sistema no migra ni borra
las cuentas SMTP existentes.

## 2. Configuración en Google Cloud

1. Entrar a <https://console.cloud.google.com/> con la cuenta administradora del
   Workspace.
2. Crear un proyecto (o elegir uno existente), por ejemplo `facturapro-crm`.
3. **APIs y servicios → Biblioteca → Gmail API → Habilitar**.
4. **Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Interno** si la app es solo para el dominio de la empresa.
     Así los scopes restringidos no pasan por la verificación pública de Google.
   - Nombre: `FacturaPro`.
   - Correo de asistencia y datos de contacto.
   - Scopes: agregar `gmail.send` y `gmail.readonly` (también `openid`, `email`,
     `profile`). El sistema los pide igual; declararlos acá evita sorpresas.
5. **Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - URI de redirección autorizado (desarrollo):
     `http://localhost:5173/api/gmail/oauth/callback`
   - URI de redirección autorizado (producción): `https://<dominio>/api/gmail/oauth/callback`
   - Copiar **Client ID** y **Client secret**.

> El redirect va al **frontend** (5173 / dominio), no a la API 8080: el proxy de
> SvelteKit reenvía `/api/*` y mantiene la cookie de sesión en el mismo origen.

## 3. Variables de entorno

En `lanzador-directo.env` (desarrollo) y en el entorno del contenedor
(producción):

```env
GMAIL_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxxxx
# Opcional. Default: <BETTER_AUTH_URL>/api/gmail/oauth/callback
GMAIL_REDIRECT_URI=http://localhost:5173/api/gmail/oauth/callback
# Opcional. Minutos entre sondeos. Default: 2
GMAIL_SYNC_INTERVALO_MINUTOS=2
# Opcional. Tiempo real con Pub/Sub. Sin estas dos, queda solo el sondeo.
GMAIL_PUBSUB_TOPIC=projects/mi-proyecto/topics/gmail-crm
GMAIL_PUBSUB_SECRET=un-secreto-largo-y-aleatorio
```

`CORREO_CLAVE` sigue siendo obligatoria: cifra los refresh/access tokens con
AES-256-GCM, igual que las claves SMTP. Sin `GMAIL_CLIENT_ID` y
`GMAIL_CLIENT_SECRET`, la sección Gmail de Configuración muestra el aviso de
configuración faltante y el conector no arranca.

Después de cambiar variables, reiniciar la API.

## 4. Modelo y seguridad

Tabla `gmail_cuentas` (migración `0038_gmail_api.sql`):

- `email`, `nombre`, `activo`.
- `refresh_token_cifrado`, `access_token_cifrado`, `access_token_expira_en`.
- `scope`, `history_id`, `watch_expira_en`, `ultima_sincronizacion`, `ultimo_error`.
- `creado_por`, `creado_en`, `actualizado_en`.

Reglas:

- Ningún token se devuelve al cliente: la API solo expone id, email, nombre,
  estado, cursor y último error.
- Cada casilla queda asignada al **área** de quien la conecta: las cuentas de
  envío y la bandeja de "sin vincular" solo se muestran a esa área (ADMIN y el
  área TODOS ven todas).
- El refresh token se pide siempre con `access_type=offline` y
  `prompt=consent`.
- El `state` de OAuth va firmado con HMAC-SHA256 y el usuario de la sesión;
  vence a los 10 minutos y se compara con `timingSafeEqual`.
- Al desconectar se borran los access tokens y se marca `activo=false`. El
  histórico de correos queda.
- Deduplicación: índice único `(cuenta_id, gmail_message_id)` en
  `seguimientos_correos`; los mensajes de ticket también se controlan por
  `ticket_correos.message_id`.

## 5. Flujo OAuth

1. En **Configuración → Correo → Conectar Gmail** el navegador va a
   `GET /api/gmail/oauth/iniciar`.
2. El backend firma el `state` y redirige a Google con los scopes.
3. Google vuelve a `GET /api/gmail/oauth/callback?code=...&state=...`.
4. Se valida la firma y que el usuario del `state` sea el de la sesión.
5. Se intercambia el código, se lee `users.getProfile` (email y `historyId`
   inicial) y se guarda/actualiza la cuenta.
6. Se redirige a `/configuracion?seccion=correo&gmail=ok|error|cancelado`.

## 6. Envío

`POST /api/seguimientos/[id]/correo` y
`POST /api/tickets/[id]/correo` con `cuentaGmailId`:

- Se arma MIME con Nodemailer `MailComposer`.
- `Message-ID` lo genera el CRM (`<uuid@dominio>`) para poder hilar respuestas.
- Asunto: incluye `[SEG-AAAA-NNNNNN]` o `[TCK-NNNNNN]`.
- `Reply-To`: `<cuenta>+SEG-...@dominio` (plus-addressing de la casilla que envía).
  En Gmail, `facturacion+TCK-000002@gmail.com` vuelve al mismo buzón;
  `seguimiento+...@gmail.com` sería otra cuenta inexistente.
- `In-Reply-To` y `References` se toman del último correo saliente del caso.
- `messages.send` recibe `threadId` cuando existe, así Gmail conserva el hilo
  aunque el cliente cambie el asunto.
- Se guardan `gmailMessageId`, `threadId`, `Message-ID` y fecha; el evento queda
  como `ENVIADO` con usuario y destinatarios.

## 7. Recepción

Sondeo cada `GMAIL_SYNC_INTERVALO_MINUTOS` (2 por defecto) más un botón manual
en Configuración:

1. Con `historyId` guardado: `users.history.list` con
   `historyTypes=messageAdded`.
2. Si el cursor quedó viejo (404): se recuperan los últimos 2 días con
   `messages.list` y se reinicia el cursor.
3. Para cada mensaje: `messages.get?format=full`.
4. Se ignoran los que están en `SENT` (salvo que no existan, para no duplicar).
5. Orden de vinculación:
   1. `threadId`.
   2. `In-Reply-To` / `References` contra `Message-ID` guardados.
   3. Alias `seguimiento+SEG-...`.
   4. `[SEG-...]` o `[TCK-...]` en el asunto.
   5. Sin coincidencia segura: **no se adivina**. Queda en
      **Correos sin vincular** con el servicio sugerido por el remitente.
6. En seguimientos: se inserta el evento entrante, se actualiza último contacto
   y, si el caso estaba en `ESPERANDO_CLIENTE`, vuelve a `EN_SEGUIMIENTO`. Se
   notifica al responsable y observadores.
7. En tickets: se reutiliza `registrarCorreoEntrante` (participantes,
   menciones, auditoría). Si el ticket está cerrado, el correo queda pendiente
   para no perderlo.
8. Se avanza el `historyId` al último visto.

Watch de Pub/Sub (`users.watch`) está implementado y es opcional. Si no se configura,
el sondeo cubre la necesidad funcional sin infraestructura extra.

## 7.1 Tiempo real con Pub/Sub

1. **Crear el topic** en Google Cloud:
   `gcloud pubsub topics create gmail-crm`
2. **Dar permiso de publicación** a la cuenta de servicio de Gmail:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-crm \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
3. **Crear la suscripción push**:
   ```bash
   gcloud pubsub subscriptions create gmail-crm-push \
     --topic=gmail-crm \
     --push-endpoint="https://<dominio>/api/gmail/pubsub/<GMAIL_PUBSUB_SECRET>" \
     --ack-deadline=10
   ```
   El endpoint tiene que ser HTTPS en producción. El secreto del path es la
   autenticación: el endpoint responde 404 si no coincide y no acepta sesión.
4. Configurar `GMAIL_PUBSUB_TOPIC` y `GMAIL_PUBSUB_SECRET`, reiniciar la API.
5. Al conectar una cuenta se llama `users.watch` con `labelIds: ["INBOX"]`.
   Gmail devuelve una expiración de hasta 7 días; el trabajo periódico renueva
   los que vencen en menos de 24 h (cada 6 horas).
6. Cada notificación trae `emailAddress` y `historyId` codificados en
   `message.data`. El endpoint **no confía en ese contenido para mutar datos**:
   lo decodifica, busca la cuenta y dispara la misma sincronización por
   `history.list`. Si llegan dos pushes juntos, un lock por cuenta evita
   sincronizaciones en paralelo; si el mensaje no está indexado todavía, el
   siguiente push o el sondeo lo recupera.
7. Si el topic o el secreto faltan, la UI muestra “Recepción por sondeo” y no se
   activa ningún watch. Al desconectar la cuenta se llama `users.stop`.

Notas operativas:

- El sondeo sigue activo como red de seguridad aunque Pub/Sub esté configurado.
- Un push fallido con 5xx se reintenta según la política de la suscripción; los
  duplicados no generan eventos gracias al índice `(cuenta_id, gmail_message_id)`.
- Si cambiás el secreto, actualizá también la URL de la suscripción push.

## 8. Límites y cuotas

- Gmail API: ~250 unidades de cuota por segundo por usuario; `send` consume 100.
- Límite de envío del buzón: ~2.000 destinatarios/día en Workspace (500 en
  Gmail personal). Los envíos masivos de cobranza siguen sujetos a ese tope.
- `429` se reporta como `CUOTA`; la UI lo muestra en el último error de la
  cuenta.
- El sondeo pide hasta 100 mensajes por página y 50 en la ventana de respaldo.

## 9. Cómo operar

1. Configurar las variables y reiniciar la API.
2. **Configuración → Correo → Conectar Gmail** y autorizar la casilla.
   Para conectar varias casillas, repetir el botón: Google muestra el selector
   de cuentas (`prompt=select_account`) y cada casilla queda como una fila
   independiente, con su propio Verificar, Sincronizar y Desconectar.
3. **Verificar**: comprueba el access token contra `getProfile`.
4. **Sincronizar**: procesa respuestas pendientes.
5. El panel indica **Recepción en tiempo real** si Pub/Sub está configurado, o
   **Recepción por sondeo cada 2 minutos** si no. Cada cuenta muestra hasta
   cuándo está vigente su watch.
6. En un seguimiento, el modal de correo muestra la cuenta Gmail y el botón
   **Enviar por Gmail**. `Solo registrar` sigue disponible para cargar un correo
   enviado por otro medio.
7. Si no hay cuentas Gmail, el comportamiento anterior se mantiene: se registra
   el correo sin enviarlo.

## 10. Diagnóstico

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Gmail API no está configurada` | Faltan env vars | Cargar `GMAIL_CLIENT_ID`/`SECRET` y reiniciar. |
| `redirect_uri_mismatch` | URI distinta en Google Cloud | Copiar exactamente la URI usada por el frontend. |
| `invalid_grant` al refrescar | Token revocado o contraseña cambiada | Desconectar y volver a conectar la cuenta. |
| `403 insufficient permissions` | Falta `gmail.readonly` o la app no es interna | Revisar scopes y publishing status. |
| `429` | Cuota de Gmail | Esperar o bajar la frecuencia; revisar tope diario. |
| Correo en “sin vincular” | El cliente cambió asunto y no hay headers | Vincularlo manualmente desde la bandeja (queda auditado). |
| Watch no se activa | Faltan `GMAIL_PUBSUB_TOPIC`/`SECRET` o el token no tiene permiso | Revisar env, reiniciar y volver a conectar. |
| Push responde 404 | Secreto del path distinto al de la suscripción | Actualizar la URL de la suscripción o el env. |
| Push responde 500 | Error transitorio al sincronizar | Revisar `ultimoError` de la cuenta y los logs; Pub/Sub reintenta. |
| Watch vence y no se renueva | El proceso estuvo caído más de 7 días | Reiniciar la API; la renovación corre a los 30 s. |

## 11. Pendientes

- Autenticación OIDC del push de Pub/Sub (hoy secreto en el path) y rotación
  automática del secreto.
- Adjuntos en el compositor del seguimiento (el modelo ya guarda metadatos).
- Envío de adjuntos PDF desde el Centro (hoy el estado de cuenta con PDF sale
  por Cobranza).
- Verificación pública de Google si la app deja de ser interna del Workspace.
- Rotación/limpieza automática de cuentas desconectadas y auditoría de accesos
  OAuth en una tabla propia.
