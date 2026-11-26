# CRM — Frontend + Web API + PostgreSQL (SvelteKit en Docker)

Arquitectura de dos proyectos **SvelteKit** desplegados en **dos contenedores
Docker**, cada uno en su propio proyecto de Compose sobre la red `crm-net`. El
backend lleva la Web API y PostgreSQL corriendo **en el mismo contenedor**.

| Contenedor | Contenido | Puerto | Descripción |
|---|---|---|---|
| `crm-frontend` | Frontend SvelteKit (`cliente/`) | `4173` | Panel CRM. Llama a `/api/*`, que su propio servidor reenvía a la API |
| `crm-backend` | Web API SvelteKit (`servidor/`) + **PostgreSQL** | `8080` → `3000`, `5433` → `5432` | API REST + OpenAPI + base de datos, todo en un contenedor |

Cada contenedor es un proyecto de compose independiente (`crm-backend` y
`crm-frontend`) y comparten la red externa `crm-net`: bajar uno no corta al otro.
`servidor/Dockerfile` (API sola, sin PostgreSQL) queda como alternativa para
desplegar contra una base externa; el arranque por defecto no lo usa.

## Entornos

Un solo camino: **contenedores Docker**, con la misma imagen en desarrollo y en
producción. Lo único que cambia entre entornos son las variables de entorno.

| Entorno | Comando | Qué ejecuta | Puertos | Config |
|---|---|---|---|---|
| **Desarrollo y producción** | `iniciar.bat` | `npm run build` + `node build` (adapter-node); PostgreSQL dentro del contenedor | 4173 / 8080 → 3000 / 5433 | `servidor/.env` |

Opcional, para iterar con HMR sin reconstruir imágenes: ver
[Desarrollo local (sin contenedores)](#desarrollo-local-sin-contenedores).

### Variables de entorno

Todas las claves y accesos entran por entorno; **ninguna vive en el repositorio**:

| Archivo | Se versiona | Para qué |
|---|---|---|
| `servidor/.env` | No (`.gitignore` y `.dockerignore`) | Credenciales reales: `BETTER_AUTH_SECRET`, `SMTP_*`, `CORREO_CLAVE`, `GMAIL_*` |
| `servidor/.env.example` | Sí | Plantilla con todas las variables y valores de relleno |

Los valores propios del contenedor (`DATABASE_URL` en `localhost:5432`, `PORT`,
`WHATSAPP_AUTH_DIR`) los fija `infra/compose-backend.yml`; el resto se hereda de
`servidor/.env` con `env_file`. `BETTER_AUTH_SECRET` es obligatorio: si falta, el
compose no arranca, `entrada.sh` aborta y el lanzador corta con un mensaje claro.

Checklist de producción:

1. `BETTER_AUTH_SECRET` real y de 32+ caracteres en `servidor/.env`.
2. `POSTGRES_PASSWORD` propio: el default es `crm` (ver `infra/compose-backend.yml`).
   Si la clave no es segura para una URL, definí `DATABASE_URL` explícita.
3. `BETTER_AUTH_URL` y `TRUSTED_ORIGINS` con el dominio real del frontend.
4. Rotar el app password SMTP y el client secret de Gmail antes de exponer el CRM.

## Arranque rápido (Windows)

1. Docker Desktop abierto (motor Linux, backend WSL 2).
2. Doble clic en **`iniciar.bat`**. El script:
   - Comprueba que Docker responda y crea la red `crm-net` si falta.
   - Valida `servidor/.env` (corta si falta `BETTER_AUTH_SECRET`).
   - Construye y levanta `crm-backend` (API + PostgreSQL) y espera `/api/salud`.
   - Construye y levanta `crm-frontend` y espera el puerto `4173`.
   - Abre el frontend y la documentación OpenAPI.
   - Queda en primer plano: **Ctrl+C o cerrar la consola detiene los contenedores
     (no los elimina ni borra los volúmenes)**.

Docker reutiliza las capas de build: solo recompila lo que cambió. `-Build` fuerza
una reconstrucción completa sin caché.

Opciones (desde una terminal):

```bat
iniciar.bat -SinNavegador  :: no abre el navegador
iniciar.bat -SinDocs       :: no abre la pestaña de OpenAPI (solo el frontend)
iniciar.bat -SinWatchdog   :: no lanza el watchdog (al cerrar la consola quedan arriba)
iniciar.bat -Build         :: reconstruye todo sin cache
```

Al arrancar se abren **dos pestañas**: la web del frontend (`:4173`) y la
documentación OpenAPI de la API (`:8080/api/docs`). El navegador no interviene en
el ciclo de vida: podés cerrar la pestaña sin que se detenga nada.

### Cómo decide parar el lanzador

El script se queda en primer plano esperando. Hay dos caminos de parada:

- **Ctrl+C**: corta el bucle, corre el `finally` y ejecuta `docker stop`.
- **Cerrar la consola (X)**: Windows mata el proceso sin `finally`, así que un
  **watchdog externo** (proceso oculto, en su propia consola) vigila el PID del
  lanzador cada 2 s y, cuando deja de existir, detiene los contenedores. Cubre
  también `taskkill`, un cuelgue o un crash.

En el cierre normal el watchdog no encuentra nada que detener y termina solo.
Además, el bucle corta si el contenedor del frontend se cae.

Para parar a mano cuando la consola ya no está abierta:

```powershell
docker stop crm-frontend crm-backend
```

Los contenedores quedan detenidos y el próximo `iniciar.bat` los reutiliza. Los
volúmenes `crm-pgdata` y `crm-wa-auth` conservan los datos entre reinicios y
recreaciones.

## URLs de prueba

| URL | Contenido |
|---|---|
| <http://127.0.0.1:4173> | Panel del cliente (frontend) |
| <http://127.0.0.1:8080/api/salud> | Estado de la API y de PostgreSQL |
| <http://127.0.0.1:8080/api/docs> | **Documentación OpenAPI (Swagger UI)** |
| <http://127.0.0.1:8080/api/openapi.json> | Especificación OpenAPI 3.0 en JSON |
| `localhost:5433` | PostgreSQL (`db=crmdb`, `user=crm`, `pass=crm`) |

> Nota: usar `127.0.0.1` en lugar de `localhost` evita resoluciones IPv6 que el contenedor no reenvía al host.

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/salud` | Comprueba la API y la conexión a PostgreSQL |
| `GET` | `/api/catalogos` | Catálogos: grupos, artículos, tipos, monedas y cobranzas |
| `GET/POST/DELETE` | `/api/cobranza` | Cartera mensual, importación de pendientes y borrado lógico auditado |
| `GET/POST` | `/api/cobranza/plantillas` | Plantillas de email/carta de cobranza con variables válidas |
| `GET/PUT` | `/api/cobranza/plantilla-predeterminada` | Plantilla sugerida para el envío individual |
| `GET` | `/api/plantillas` | Plantillas agrupadas por grupo de facturación |
| `POST` | `/api/plantillas/eliminar` | Borrado lógico por lote (`{ ids: number[] }`) |
| `POST` | `/api/plantillas/importar` | Importa filas de una planilla mensual |
| `GET` | `/api/clientes` | Lista de clientes |
| `POST` | `/api/clientes` | Crea un cliente (`{nombre, email, telefono?}`) |
| `GET` | `/api/clientes/:id` | Cliente por id |
| `PUT` | `/api/clientes/:id` | Actualiza un cliente |
| `DELETE` | `/api/clientes/:id` | Elimina un cliente |

La importación de Cobranza se inicia desde un modal: el usuario elige el período y el
sistema calcula automáticamente el corte como el último día de ese mes. La planilla
se lee y muestra sus validaciones antes de importar. La operación es atómica: si existe
una sola validación fallida (incluidos servicio inexistente, serie/número faltantes,
duplicados o fechas posteriores al corte), no se incorpora ninguna fila.

La exportación de créditos pendientes de Zureo utiliza las primeras cuatro filas como
título/filtros y comienza sus encabezados en la fila 5. El mismo modal permite descargar
`PLANTILLA COBRANZA.xlsx` con esos encabezados y cuatro filas de ejemplo. El lector usa `Contacto`,
`Comp.`, `Moneda`, `Importe`, `Saldo pendiente`, `Vence`, `Fecha doc.` e
`Identificador` solo como referencia del contacto; la clave del comprobante se forma
con el servicio y `Comp.` porque `Identificador` se repite entre documentos del mismo
contacto. `Comp.` se descompone como tipo, serie y número: `VCre A-19943` se
normaliza a tipo `Venta Crédito`, serie `A` y número `19943`. Se incluyen todos los
tipos presentes en la planilla —ventas, recibos, notas de crédito, notas de débito y
sus variantes— y se normalizan contra los tipos activos del catálogo. La moneda `$`
se conserva como pesos uruguayos y `USD` como dólares. Los recibos sin serie, como
`RC 4754`, se conservan con serie vacía; una fila con comprobante realmente faltante
queda señalada para corregir antes de una importación atómica.

Cuando la planilla de Cobranza contiene servicios inexistentes, el modal muestra solo
la cantidad de faltantes y permite descargar `servicios-faltantes-cobranza.xlsx`. La
primera hoja contiene las filas a completar con ID, servicio, RUT/CI, tipo de
numeración, grupo, gestión, tipo de cliente, modalidad de cobranza y gestión de
facturación. La segunda hoja contiene los valores activos de cada catálogo como
referencia. La carga de esa planilla valida que todas las columnas estén completas,
que los servicios correspondan a los faltantes y que los valores pertenezcan a los
 catálogos activos antes de crear los servicios.

El validador muestra por defecto únicamente las filas con observaciones; las filas
correctas pueden volver a visualizarse quitando el filtro. El filtro es solo visual:
la decisión de habilitar la importación usa siempre la colección completa de
validaciones.

Las observaciones de Cobranza tienen la acción **Excluir**. El usuario indica un
motivo y la regla queda guardada para omitir esa observación en futuras
importaciones. La clave se arma con las partes en que se descompone `Comp.`:

- Con número: `numero|SERVICIO|TIPO COMPROBANTE|SERIE|NUMERO`.
- Sin número: `sincomprobante|SERVICIO`, que omite todas las filas sin comprobante
  de ese servicio.

Incluir tipo y serie evita que dos documentos distintos con el mismo número se
excluyan entre sí.

### Grupos de cobranza

Son **independientes** de los grupos de facturación: la cartera se agrupa por
cobrador, zona o campaña, y eso cambia con frecuencia.

- Se administran en **Configuración → Grupos → Cobranza**, con nombre, colores y
  orden del bloque.
- Se asignan desde **Servicios → editar** (uno por uno) o desde **Cobranza**
  seleccionando varios servicios y usando “Asignar grupo”.
- La cartera muestra una cabecera coloreada por grupo, colapsable, con cantidad
  de servicios y subtotales en pesos, dólares y equivalente. “Sin grupo” queda al
  final.
- El filtro **Grupo** permite aislar un bloque.

### Filtros de cartera

Además de período, búsqueda, gestión, cliente y grupo, la cartera filtra por:

- **Tramo de deuda**: a vencer, 1–30, 31–60, 61–90, +90. Es **excluyente**:
  cada servicio entra en el tramo de su comprobante impago más antiguo (días
  desde la emisión, pesos y dólares juntos). Un servicio con deuda de +90 y
  también de 1–30 aparece solo en +90. Los servicios sin saldo pendiente no
  entran en ningún tramo.
- **Cantidad de envíos**: 0, 1, 2, 3 o +4 mails enviados.

### Copia global de control interno

Vive en **Configuración → Correo**, debajo de las cuentas SMTP. Es global: no se
configura desde los modales de envío.

- Emails de copia (varios, separados por coma).
- Tipo: **CC** (visible para el cliente) o **CCO** (oculta).
- Si una dirección de copia coincide con un destinatario, no se duplica.

La configuración se guarda en el servidor y se lee al momento de enviar, tanto en
envíos individuales como masivos.

### Envíos masivos en segundo plano

Solo se pueden seleccionar los servicios que tengan **al menos un mail de
cobranza registrado**. El resto muestra el sobre rojo tachado y el checkbox
deshabilitado; al cargar un destinatario en el detalle, se habilita solo.

Al seleccionar servicios en la cartera aparece la **barra flotante de acciones**
(la misma de Plantillas) con:

- **Enviar mails**: las plantillas se eligen como tarjetas y cada cuenta de
  correo se muestra como una tarjeta que agrupa su email principal y sus alias
  como remitentes seleccionables; se encola un lote.
- **Asignar grupo**: muestra los grupos como un listado con sus colores y la
  cantidad de servicios actuales; se elige uno o «Sin grupo» y también se puede
  crear un grupo nuevo sin salir del modal.

El envío corre en el **servidor**, no en el navegador: cerrar la pestaña no lo
interrumpe. En la cabecera aparece un widget con `enviados/total` (por ejemplo
`2/26`), estado, porcentaje y una **barra de progreso** que distingue enviados
(índigo), errores (rojo) y pendientes; se actualiza solo. Al hacer clic se ve el
estado de cada mail (`PENDIENTE`, `PROCESANDO`, `ENVIADO`, `ERROR`) y si fue
reanudado tras un reinicio.

Al arrancar, los ítems que quedaron en `PROCESANDO` vuelven a `PENDIENTE` con la
marca **reanudado** y se reintentan. La demora entre envíos se ajusta con
`ENVIOS_DELAY_MS` (por defecto 1200 ms).

### Planilla de mails de cobranza

El botón **Planilla de mails** de la cabecera descarga `mails-cobranza.xlsx` con
todos los servicios vivos: **ID**, **Servicio** y **Mails de cobranza**
(separados por `;`). Se completa y se vuelve a subir desde la misma modal; antes
de aplicar se muestra el diff por servicio.

- **Altas**: los mails nuevos se agregan; los que ya existían no se duplican.
- **Bajas lógicas**: los que ya no están en la celda quedan con `activo = false`,
  fecha, usuario y motivo. Nunca se borran: quedan en el histórico
  (`servicios_emails`) y en `auditoria_cobranza`.
- **Compartidos**: un mail `COMPARTIDO` que se retira de cobranza pasa a
  `FACTURACION` y sigue recibiendo facturas. Un mail solo de facturación que se
  agrega a la planilla pasa a `COMPARTIDO`.
- **Celda vacía**: no cambia ese servicio. **`-`**: retira todos sus mails de
  cobranza.
- Cada importación se agrupa en `importaciones_emails` y la modal muestra las
  últimas. La importación es atómica: si una fila tiene un mail inválido o un ID
  inexistente, no se aplica nada.

### Envío de estado de cuenta

Configuración → **Correo** administra cuentas SMTP con sus alias (Gmail con dominio
propio incluido) y permite enviar una prueba para validar credenciales. Las claves
se guardan cifradas con AES-256-GCM usando `CORREO_CLAVE`; la API nunca las devuelve.

Cada cuenta muestra el estado de su credencial: **Credencial OK**, **Sin verificar**
o **Contraseña rechazada**. El botón **Verificar** prueba conexión y autenticación
sin enviar un correo; **Probar** envía un mail de prueba. Los errores SMTP se
clasifican (autenticación, conexión, destinatario, límite, contenido) y, ante una
credencial rechazada, el envío masivo se corta en el primer mail en vez de marcar
todos como error. Al guardar una contraseña nueva el estado vuelve a «Sin verificar».

En el detalle de cobranza:

- **Cabecera fija** en una sola línea: período, servicio, totales, **Modelo** (con
  botón para dejarlo como predeterminado), **Enviar desde** (cuenta o alias) y
  **Enviar**. La plantilla predeterminada se guarda en `configuracion_cobranza`.
- **Comprobantes en pesos** y **comprobantes en dólares** se muestran en dos
  tablas separadas. Los totales de la cabecera (UYU, USD y equivalente) y el pie
  de cada tabla suman **saldos pendientes de lo que se envía**: descuentan la
  exclusión temporal y, con **Enviar solo vencidos**, los comprobantes que
  todavía no vencieron. Cada fila muestra el **plazo** configurado y si está
  vencida o cuántos días faltan.
- **Enviar solo vencidos**: se activa en la línea del título de comprobantes.
  Envía únicamente los comprobantes cuyo plazo de pago ya venció; el resto se
  tacha y no suma en la cabecera ni en el pie de la tabla. Requiere que la
  plantilla liste los comprobantes (`{{estado_cuenta_general}}`,
  `{{estado_cuenta_pesos}}` o `{{estado_cuenta_dolares}}`); si no, el check queda
  deshabilitado. El servidor aplica el mismo filtro antes de armar el correo.
- **Días de vencimiento**: se configuran por servicio en **Servicios → Editar**
  (por defecto 30). El comprobante está vencido cuando los días desde la emisión
  superan ese plazo; el día exacto del vencimiento todavía no cuenta.
- **Destinatarios**: emails del servicio; sin al menos uno no se puede enviar.
  Se pueden cargar varios de una vez separados por `;` o `,`
  (`luis@empresa.com; marta@empresa.com; uva@empresa.com`). Los repetidos quedan
  una sola vez. El envío va a todos los destinatarios más la copia de control si
  está habilitada.
- **Enviar estado de cuenta**: usa la plantilla y la cuenta elegidas, y deja el
  registro en el historial con fecha, hora, usuario, plantilla y estado. El
  usuario sale de la sesión activa (su email), no del cuerpo del pedido; los
  envíos anteriores a este cambio quedaron sin usuario.
- **Exclusión temporal** (ícono de sobre tachado): saca el comprobante del próximo
  envío y de su total; la fila queda tachada como las no vencidas. Al completarse
  el envío, vuelve a incluirse solo.
- **Eliminar** (ícono de papelera): borrado lógico permanente. Si el comprobante
  reaparece en una planilla futura, se actualizan sus importes pero sigue dado de baja.

El contador de envíos de la cartera cuenta únicamente envíos confirmados.

Los períodos se muestran como **Noviembre 2026** (mes y año) y se ordenan del más
reciente al más antiguo. Internamente siguen guardándose como `YYYY-MM`.

### Plantillas de cobranza

El modal tiene tres columnas: plantillas a la izquierda, editor al centro y
**variables a la derecha**. Cada variable es un botón que la inserta en el campo
con foco, en la posición del cursor.

`{{estado_cuenta_pesos}}` y `{{estado_cuenta_dolares}}` generan una **tabla HTML**
equivalente a la del detalle de cobranza (emisión, vencimiento, comprobante,
importe y saldo), con el total de esa moneda al pie.

`{{estado_cuenta_general}}` incluye **solo las tablas que tienen deuda**: si el
servicio debe en pesos y dólares, van las dos; si solo debe en una moneda, va esa
única tabla. El correo se envía con versión HTML y texto plano.

### Carta PDF adjunta

Al habilitar “Adjuntar carta PDF” se puede cargar una **imagen de fondo a página
completa**. El servidor compone la carta HTML/CSS y la exporta a PDF con el
Chrome/Chromium instalado (`--headless --print-to-pdf`), sin dependencias extra,
y la adjunta al correo.

- La imagen se comprime en el navegador (máx. 1400 px, JPEG) antes de guardarse.
- En la máquina de desarrollo usa Chrome o Edge instalados. Las imágenes del
  contenedor **ya incluyen chromium** (`CHROME_PATH=/usr/bin/chromium`) y las
  fuentes Liberation, así que el PDF también se genera en producción.
- Si el PDF no se puede generar, el envío sigue y la carta se incluye en el
  cuerpo del correo como respaldo; queda registrado en el log.

La API también permite CORS, pero el frontend **no** la llama directamente: usa su proxy
`cliente/src/routes/api/[...ruta]/+server.ts`, que reenvía `/api/*` a `API_URL`. Así la URL
de la API se configura en un solo sitio y no hay problemas de CORS.

## Multifacturador: plantillas de facturación

Pantalla en `/multifacturacion` (ítem **Multifacturador** del menú), con tres
pestañas: **Plantillas**, **Facturador** y **Bandeja**.

### Modelo

```text
Servicio → Plantilla → Líneas de artículo
Grupo de facturación (agrupa plantillas para la pantalla)
```

- **Servicio** = el cliente facturable. Su identidad es `contactoFacturacion`, el
  nombre con el que se factura. Tiene **numeración** (`RUT/CI`, texto), **tipo**
  (`RUT`, `CEDULA`, `OTROS`; si no hay numeración se fuerza `SIN_NUMERACION`),
  **grupo**, los atributos de gestión (`TIPO_GESTION`, `TIPO_CLIENTE`,
  `MODALIDAD_COBRANZA`, `GESTION_FACTURACION` y su comentario), nombre de
  fantasía y un switch de **habilitado/deshabilitado**.
- **Plantilla** = las líneas que se facturan a un servicio. Sus atributos de
  facturación son **moneda**, **tipo de comprobante**, **tipo de precio** e
  **ID de cliente** (numérico, opcional): se importan por fila y se editan como
  chips en la tabla. Se identifica por **servicio + agrupador** (el grupo se
  hereda del servicio).
- **Código / detalle** de cada línea = artículo (`articulos`).
- El **número agrupador** (columna `Número` del Excel) agrupa las líneas de una
  misma factura; no es un comprobante real.

Tablas: `servicios`, `plantillas`, `plantillas_lineas`, `facturas`,
`factura_lineas`, `variables` y los catálogos `grupos_facturacion`, `articulos`,
`tipos_comprobantes`, `tipos_precios`, `monedas`, `tipos_gestion`,
`tipos_cliente`, `modalidades_cobranza`, `tipos_gestion_facturacion` y
`monedas_tipos_precio` (pares moneda → precio para filtrar el chip de precio).
Los grupos son configurables (`FIJOS`, `VARIABLES`, `ALARMAS`, `INDIVIDUAL`).

### Servicios (pantalla propia)

Ítem **Servicios** del menú (`/servicios`): tabla con la información de cada
servicio, switch de habilitado/deshabilitado, modal de edición (nombre de
fantasía, RUT/CI y tipo, grupo, comentario de gestión) y botón **Importar
Excel** que levanta el archivo de servicios:

```text
Contacto: nombre · RUT / CI · Tipo numeración · Grupo
Tipo de gestión · Tipo de cliente · Modalidad de cobranza · Gestión de facturación
```

El botón abre un modal con dos acciones: importar el archivo o descargar
`PLANTILLA SERVICIOS.xlsx`. La plantilla trae la hoja `Servicios a importar`
con 4 ejemplos armados con los catálogos activos y la hoja `Parámetros` con los
valores válidos de cada catálogo. El lector busca la hoja por nombre y, si no
existe, usa la primera (archivos viejos).

Reglas: los catálogos se validan contra los existentes (un faltante rechaza el
archivo con la lista); no se importan **duplicados** (dentro del archivo o en la
base) y se informan; la numeración es texto, sin numeración el tipo es
`SIN_NUMERACION`, y con numeración el tipo es obligatorio (`RUT`, `CEDULA` u
`OTROS`).

### Importación de plantillas

El botón **Importar Excel** de la pestaña Plantillas lee el `.xlsx` en el
navegador con SheetJS y envía las filas a `POST /api/plantillas/importar`.
Columnas esperadas:

```text
Contacto: nombre · Fecha · Serie · Número · Moneda · Tipo de comprobante
Tipo de precio · Artículo: código · Artículo: comentario · Cantidad
Importe unitario (x1) · Comentario · ID Cliente · EFactura: ID Compra
UTE fecha vencimiento: · Detalle · Información Adicional
```

Reglas de importación:

- Los catálogos (moneda, tipo de comprobante, tipo de precio, artículo) se
  validan contra los existentes: un valor faltante rechaza el archivo (`422`)
  indicando catálogo y valores. Nada se auto-crea.
- El servicio se busca por contacto. Si **no existe** o está **deshabilitado**,
  esas filas **no se importan** y se muestran en un modal al terminar
  (`serviciosOmitidos`).
- `ID Cliente` es numérico y opcional; un valor no numérico rechaza el archivo.
- Los **campos auxiliares de EFactura** (`EFactura: ID Compra`, `UTE fecha
  vencimiento:`, `Información Adicional`) son del **documento**, no de la línea:
  en la importación se toma el primer valor no vacío de las filas que componen
  la misma plantilla. `Detalle` auxiliar no viene en la planilla y se carga a
  mano en el modal.
- La columna `Comentario` es del **documento**: se guarda una sola vez en el
  comentario general de la plantilla y no se repite en cada línea.
- Reimportar el mismo archivo **no duplica** nada: las plantillas se reutilizan y
  se **reemplazan** sus líneas con el contenido del nuevo archivo.

Los chips de la plantilla (comprobante, moneda, precio, ID de cliente) son
selects que editan la fila (`PATCH /api/plantillas/[id]`). Igual que en el
Facturador, la tabla permite **edición rápida** del comentario general, el
detalle del artículo, la cantidad y el importe unitario haciendo clic en el
valor (`PATCH /api/plantillas/[id]/lineas/[lineaId]`). El chip de
**tipo de comprobante** muestra su **abreviatura** (máximo 8 caracteres,
definida en el catálogo) y el desplegable muestra el nombre completo con
buscador. El select de precio se filtra por la moneda elegida según
`monedas_tipos_precio`; si no hay pares cargados para esa moneda, muestra todos
los precios.

Después de guardar, la tabla se refresca **sin desmontarse**, así la fila queda
en el mismo lugar y podés seguir editando.

> Las variables de sustitución (`{{periodo}}`) se reemplazarán recién en el
> Facturador; en esta pantalla no se procesan.

### Facturador y Bandeja

El **período en proceso** (`YYYY-MM`) y la **fecha general de facturación** se
configuran una sola vez en el **Facturador**, en la misma ventana flotante de
las variables, y quedan persistidos en `configuracion_facturacion` (PostgreSQL).
Arriba de la tabla hay una banda visible con el período y la fecha vigentes, y
el botón **Cambiar período** abre esa ventana; al cambiar el mes se propone el
último día de ese mes. En la Bandeja la banda también se ve, pero sin edición.

Al enviar plantillas al Facturador se usa ese período y esa fecha, y se crea una
**factura**: una copia, no una referencia. Guarda snapshot del servicio
(contacto, numeración y tipo, nombre de fantasía, atributos de gestión) y de la
plantilla (moneda, tipo de comprobante, tipo de precio, ID de cliente, importes
y comentarios). La plantilla original no se modifica. Una plantilla no se copia
dos veces al mismo período mientras siga viva.

El modal de envío de Plantillas es **informativo**: muestra el período y la
fecha general que se van a aplicar (con acceso a la pestaña Facturador para
cambiarlos) y avisa **antes de confirmar** qué plantillas del lote ya tienen
factura en ese período, con su estado (En proceso, Pendiente, En bandeja,
Facturado, Cobrado). La validación del backend no cambia: las ya enviadas se
omiten y solo se informa la cantidad de facturas nuevas.

Las **variables** se administran desde el Facturador en la misma ventana
flotante y arrastrable que el período. Guarda el catálogo de nombres y el
**último valor usado** en PostgreSQL (`variables.valor`) con el botón
**Guardar**; esos valores se reutilizan en los próximos envíos. El panel lista
también las variables que aparecen en los textos aunque no estén dadas de alta.
Antes de pasar facturas a Bandeja, **todas las variables usadas por el lote
tienen que tener valor**: si falta alguna, se abre el panel con las faltantes
resaltadas. La Bandeja no tiene botón de variables: solo muestra el texto ya
sustituido.

Cada factura nace con la fecha general y después se puede editar fila por fila
en la columna **Fecha** del Facturador. Convención de fechas del proyecto: se
muestran y se escriben como `dd/mm/aaaa`, la referencia horaria es
`America/Montevideo` (UTC-3) y el ISO (`YYYY-MM-DD`) viaja solo en la API. Las
fechas puras (`date`) se formatean por componentes para no correr el día; los
timestamps pasan por `formatearFechaHora`, que aplica la zona.

Ciclo de estados:

```text
PROCESO ──► PENDIENTE ──► BANDEJA ──► FACTURADO ──► COBRADO
   └────────────┴────────────┴────────────┴──────────► ELIMINADO
```

- **PENDIENTE** exige el motivo (`motivoPendiente`).
- **BANDEJA** usa la fecha que ya tiene la factura (solo se pide si faltara) y
  **sustituye todas las variables** de los comentarios. Si falta un valor, la
  operación se rechaza con `422` y la lista de variables faltantes. Antes de
  sustituir guarda un snapshot de los textos originales en
  `facturas.variables_snapshot`.
- **Devolver a Facturador** restaura los `{{clave}}` exactos desde ese snapshot
  y lo descarta. Las facturas que ya estaban en Bandeja antes de este cambio no
  tienen snapshot: vuelven con el texto tal cual.
- **FACTURADO** y **COBRADO** son solo cambios de estado: el facturador real es
  externo. `serie` y `numero` se pueden completar a mano en el modal de la
  factura.
- **ELIMINADO** es borrado lógico, como en plantillas.

En el Facturador la tabla es la misma que en Plantillas: se agrupa por **grupo de
facturación** con el mismo color, y cada fila es una factura (el período se ve
en el detalle del contacto). La factura también muestra los **chips** de
comprobante, moneda, precio, ID de cliente y los **campos auxiliares** (solo si
tienen valor). Tiene edición rápida inline (comentario general, detalle, código,
cantidad e importe) y un modal por fila. Al editar el código se valida contra el
catálogo de artículos: un código inexistente no se guarda, el borde queda en
rojo y se muestran las coincidencias con su descripción.

### Campos auxiliares de EFactura

`ID Compra`, `UTE fecha vencimiento`, `Detalle` e `Información Adicional` son
**del documento**, no de la línea: viven en `plantillas` y en `facturas`, se
copian al enviar al Facturador y se ven como chips en la fila (solo si tienen
valor). Se editan en el modal, en el bloque **Campos auxiliares**.

### Modal de documento

Plantillas, Facturador y Bandeja comparten `ModalDocumento`: cabecera (moneda,
comprobante, precio, ID cliente, fecha, serie, número, comentario general),
campos auxiliares y la tabla de líneas de facturación. Cada campo guarda al salir
o al cambiar el select. Las líneas se pueden **agregar**, **copiar** (duplica
esa línea con los mismos datos al final de la tabla) y **eliminar de forma
definitiva** (`POST`/`DELETE /api/{plantillas|facturas}/{id}/lineas`), con una
regla: el documento nunca queda sin líneas. El código de artículo se escribe o se
elige de un panel con **F2** / `Ctrl+K`, que muestra el nombre debajo del código.

La copia desde Plantillas es un **snapshot**: agregar, editar o borrar líneas en
una factura no toca la plantilla, y editar o reimportar la plantilla no toca las
facturas ya creadas.

### Bandeja: cola de trabajo

La Bandeja muestra **solo** facturas en estado `BANDEJA` (sin filtro de estado).
Es la cola de lo que falta facturar, con dos salidas:

- **Devolver a Facturador**: las seleccionadas pasan a `PROCESO`, vuelven a la
  pestaña Facturador y desaparecen de la Bandeja (`POST /api/facturas/devolver`).
- **Generar Multifacturación**: arma el `.xlsx` con el formato de la planilla
  modelo, lo descarga y marca las facturas como `FACTURADO`
  (`POST /api/facturas/facturado`), así salen de la cola.
- **Facturar API** está visible pero deshabilitada: la integración todavía no
  existe.

En el menú flotante hay un check **Deseleccionar todos** y la barra se esconde al
ejecutar una acción o al quedar sin selección.

#### Orden manual

La columna **Orden** permite numerar a mano las facturas que se quieren procesar
primero. Las numeradas forman el bloque **Prioridad** arriba de todo, en orden
ascendente; el resto sigue en el orden actual por grupo. Borrar el número (×) la
devuelve a su lugar natural.

#### Enviados a facturar

El botón **Ver Enviados a facturar** (arriba a la derecha, en la Bandeja)
abre un modal con el histórico de lo que salió de la cola: **fecha**, **hora**,
**vía** (Multifacturación, API o Manual), **número** de factura (`S/N` si
todavía no tiene), **servicio**, **cantidad de ítems** —con el detalle de código,
artículo, cantidad y precio al pasar el mouse— y la **adenda**.

Arriba de la lista solo aparecen los envíos **nuevos**. El botón **Limpiar**
(pide confirmación) los marca como vistos y los oculta; **no borra nada**. El
check *Ver también los ya vistos* permite consultar el histórico completo.

La fecha y la vía se sellan al pasar a `FACTURADO` (`facturado_en`,
`facturado_por`) y la bandera `facturado_visto` es la que usa *Limpiar*.

#### Planilla de multifacturación

Mismas 17 columnas y mismo orden que la planilla que se importa, una fila por
línea. La **serie** sale de Configuración → Facturación (por defecto `A`, seed) y
el **Número** es simbólico: arranca en 1 y suma de a uno por factura, agrupando
todas sus líneas. Los datos del documento (contacto, fecha, ID cliente, adenda,
serie/número y los 4 auxiliares) se repiten en cada línea. El archivo se puede
reimportar: el número funciona como agrupador de la plantilla.

### Variables

`variables` guarda el **nombre** (ej. `mes-anio`) y el **último valor usado**.
Se muestran sin llaves y se administran desde el Facturador. En los textos
viajan como `{{mes-anio}}` y **no distinguen mayúsculas**: `{{MES-ANIO}}` y
`{{mes-anio}}` son la misma variable. El panel flotante permite agregar nombres,
escribir valores y **Guardar**: el valor queda persistido en PostgreSQL y se
reutiliza en los próximos envíos. Al pasar a Bandeja se escribe dentro del
comentario, el placeholder desaparece y los textos originales quedan guardados en
`facturas.variables_snapshot` para poder restaurarlos al volver al Facturador.

### Acciones

- Cada plantilla y cada grupo tiene un botón con **ícono de lápiz** para editar
  (la edición se implementa en la siguiente etapa).
- Al seleccionar una o más plantillas aparece una **barra flotante de acciones
  por lote**, abajo al centro, con ícono y etiqueta visible:
  - **Eliminar** → borrado lógico (`eliminado_en`), no se borran filas ni líneas.
  - **Enviar a Facturador** → pendiente para la etapa del Facturador.
- Sin selección, la barra no se muestra.

## Configuración

Pantalla `/configuracion` (ítem **Configuración** del menú), con cuatro píldoras:

- **Catálogos**: administra los catálogos de las importaciones (tipos de
  comprobante con su abreviatura, monedas, tipos de precio con su moneda,
  tipos de gestión, tipos de cliente, modalidades de cobranza, gestión de
  facturación y artículos). Permite **alta**, **edición** y
  **habilitar/deshabilitar** cada valor.
- **Grupos**: alta y edición de grupos con **color de fondo** y **color de
  letra**; esos colores se usan en las cabeceras de Plantillas y Facturador.
- **Apariencia**: colores globales de las **filas pares e impares** (fondo y
  letra). Se aplican al instante y quedan guardados para todos los usuarios.
- **Facturación**: **serie** de la planilla de multifacturación. Se guarda en
  `configuracion_facturacion` (una fila) y el seed la crea con `A`.
- **Correo**: cuentas SMTP para los envíos de Cobranza y cuentas de Gmail
  conectadas por OAuth para seguimientos y tickets (envío con hilo y lectura de
  respuestas). La configuración de Google Cloud está en `GMAIL-API.md`.

Los colores globales viven en `configuracion_visual` (una fila) y se inyectan
como variables CSS (`--fila-par-fondo`, `--fila-par-texto`,
`--fila-impar-fondo`, `--fila-impar-texto`) desde el layout raíz, así que
aplican a todas las tablas sin parpadeo.

Un valor **deshabilitado** deja de ofrecerse en los chips y la importación lo
rechaza como faltante, pero los registros que ya lo usan se siguen mostrando.
El par **moneda → tipo de precio** (`monedas_tipos_precio`) se edita desde el
catálogo de tipos de precio.

## Base de datos con Drizzle ORM

El acceso a PostgreSQL va con **Drizzle ORM** (no SQL crudo). Capas en `servidor/src/lib/server/`:

| Carpeta | Responsabilidad |
|---|---|
| `base-datos/esquemas/` | Definición de tablas (`pgTable`). Fuente de tipos y de las migraciones. |
| `base-datos/conexion.ts` | Pool de `pg` + cliente Drizzle (`db`). Punto único de acceso tipado. |
| `base-datos/errores.ts` | Clasifica errores de pg (p. ej. `esViolacionUnica` para el 409). |
| `repositorios/` | Consultas por entidad. Los endpoints/servicios delegan acá, no escriben SQL. |

Flujo de cambios de esquema:

```bash
cd servidor
npm run db:generate   # genera el SQL en drizzle/ a partir del esquema TS
npm run db:migrate    # aplica las migraciones pendientes
npm run db:push       # sincroniza esquema <-> BD sin archivos de migración (dev)
npm run db:studio     # GUI para inspeccionar la BD
```

`drizzle.config.ts` apunta a `base-datos/esquemas/index.ts` y corre **fuera** de
SvelteKit, por eso lee `process.env` (no `$app/env`). Los archivos de esquema **no**
deben importar nada de SvelteKit.

> **Drizzle es la única fuente de verdad del esquema y los datos.** No existe
> `init.sql`: al arrancar el server, el hook `init` (`hooks.server.ts`) llama a
> `prepararBaseDatos()` (`base-datos/arranque.ts`), que aplica las migraciones
> pendientes de `drizzle/` y seedea los datos de ejemplo (`base-datos/seed.ts`).
> Ambos pasos son **idempotentes**: re-arrancar no duplica filas ni re-ejecuta
> migraciones ya registradas. Si la BD falla, el server **no arranca** (fallo
> visible, no silencioso). Por eso los Dockerfiles copian `drizzle/` al
> contenedor.

Gotcha: Drizzle **envuelve** el error de `pg`. El código SQL (p. ej. `23505`) no está en
`error.code` sino en `error.cause.code`. Usá `esViolacionUnica(error)` de
`base-datos/errores.ts` en vez de leer `error.code` directamente.

## Login con código de 6 dígitos (OTP)

Autenticación con **Better Auth** + plugin **Email OTP**: el usuario pide entrar con su
correo, recibe un **código de 6 dígitos** y lo tipea para crear la sesión. No hay contraseñas.

Capas en `servidor/src/lib/server/autenticacion/`:

| Archivo | Responsabilidad |
|---|---|
| `auth.ts` | Instancia de Better Auth: adapter Drizzle + plugin Email OTP (6 dígitos, 5 min, 3 intentos). |
| `correo.ts` | Envío por SMTP (Nodemailer). Sin `SMTP_HOST`, entra en **modo dev** y loguea el OTP en consola. |

Flujo: el frontend llama a `/api/auth/*` (ruteado a Better Auth por `isAuthPath` en
`hooks.server.ts`). `sendVerificationOTP` genera el código y lo manda por correo; el
cliente lo verifica con `signIn.emailOtp`. El esquema (user/session/account/verification)
está en `base-datos/esquemas/auth.ts` y se migra como el resto. Pantalla de login en
`cliente/src/routes/login` (pantalla `Login.svelte`).

### Sesión persistente (15 días)

La sesión dura **15 días** desde el login y se renueva sola una vez por día con el
uso (`session.expiresIn` / `updateAge` en `auth.ts`). Vive en la tabla `session`
de PostgreSQL, sobre el volumen `crm-pgdata`, así que **parar, reconstruir o
recrear los contenedores no cierra la sesión**. Al volver a abrir la app, el
guard de `(app)/+layout.server.ts` encuentra la cookie válida y entra directo;
`/login` redirige a `/principal` si ya hay sesión.

Detalles que importan:

- La cookie es `httpOnly`, `sameSite=lax`, `path=/`. El flag `Secure` se activa
  solo si `BETTER_AUTH_URL` empieza con `https://` (en local es http).
- **La renovación se propaga al navegador.** El guard consulta `get-session` del
  lado del servidor y un `fetch` interno no aplica `Set-Cookie` por sí solo; por
  eso `cliente/src/lib/server/propagar-cookies.ts` reemite esas cookies con
  `cookies.set`, y la sesión **rueda con el uso** en vez de vencer a los 15 días
  fijos del login.
- **`BETTER_AUTH_SECRET` tiene que ser estable.** `levantar.ps1` lo inyecta desde
  `servidor/.env`; si lo cambiás (o falta y cambia el placeholder), todas las
  cookies viejas dejan de valer y hay que loguearse una vez más.
- La cookie es por host: `http://127.0.0.1:4173` y `http://localhost:4173` son
  sesiones distintas. Usá siempre la URL que abre `iniciar.bat`.

Variables de entorno (todas en `servidor/.env` y en los contenedores):

| Variable | Descripción |
|---|---|
| `BETTER_AUTH_SECRET` | Firma las cookies de sesión. **>=32 caracteres**; obligatoria en producción. |
| `BETTER_AUTH_URL` | URL pública del **front** (el origin que usa el navegador; ej. `http://localhost:4173`). |
| `TRUSTED_ORIGINS` | Orígenes del front confiables para Better Auth, separados por coma (CSRF). |
| `PROTOCOL_HEADER` · `HOST_HEADER` | Cabeceras de proxy que lee adapter-node (`x-forwarded-proto`, `x-forwarded-host`). |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | SMTP para enviar el OTP (ej. `smtp.gmail.com:587` con una *app password* de 16 dígitos). |

### Envío real del OTP por correo

Todas las variables se declaran en `servidor/src/env.ts` y su plantilla está en
`servidor/.env.example`. En **desarrollo**, completá `servidor/.env`:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=tu-app-password-de-16-digitos
SMTP_FROM=tu-correo@gmail.com
```

- **Sin `SMTP_HOST`** → modo dev: el código de 6 dígitos se imprime en la consola
  del servidor (no se envía mail). El login sigue funcionando.
- **Con `SMTP_HOST`** → envío real por Nodemailer/SMTP. Verificado con Gmail
  (`200` + *message-id* real de Gmail en el log, `[correo] OTP enviado a ...`).

**En contenedor** el `.env` está en `.dockerignore` (correcto: no debe entrar en la
imagen), así que las credenciales se inyectan en **runtime**:

- `scripts/levantar.ps1` lee `servidor/.env` y pasa solo las `SMTP_*` con `-e`
  (no pasa `DATABASE_URL`/`BETTER_AUTH_*`: esos ya vienen del `Dockerfile` con los
  valores correctos *dentro* del pod — el `.env` de host tiene los de desarrollo).
- `infra/compose-backend.yml` usa `env_file: ../servidor/.env`; las claves
  declaradas en `environment:` tienen prioridad sobre el `env_file`.

Gotchas del envío:

- **Better Auth traga los errores de SMTP** (`runInBackgroundOrAwait` los loguea y
  responde igual `200 {"success":true}`). Por eso `correo.ts` deja un log claro
  (`[correo] ERROR SMTP ...`) en el servidor: ante un fallo, el diagnóstico está
  en el log del backend, no en la respuesta HTTP.
- Si el SMTP no responde, `correo.ts` corta la conexión a los 15 s
  (`connectionTimeout`) para no colgar el pedido de login.
- Gmail exige una **app password** (16 dígitos), no la clave normal de la cuenta.

> **Gotcha importante (protocolo)**: `adapter-node` asume **`https://`** por defecto
> (asume TLS en un proxy). Better Auth compara orígenes **completos** en `isAuthPath`
> y valida el header `Origin` (CSRF) contra `baseURL`/`trustedOrigins`, así que un
> protocolo falso rompe el login (**404 silencioso** o **Invalid origin**). La cadena
> correcta es: el proxy del front envía `x-forwarded-proto` + `x-forwarded-host`, el
> backend los lee con `PROTOCOL_HEADER` + `HOST_HEADER`, y el front deriva el protocolo
> **real del socket** (`platform.req.socket.encrypted`, en `api/[...ruta]/+server.ts`) en
> vez de usar `event.url.protocol` (que viene contaminado con `https`).
>
> **Gotcha (`trustedOrigins`)**: el navegador manda `Origin: <front>` en todo POST a
> `/api/auth/*`. Better Auth lo valida contra `baseURL` + `trustedOrigins`; sin incluir
> el origin del front ahí, responde `403 MISSING/INVALID origin`.

## Pantallas y componentes de UI

Frontend en `cliente/src/lib/` (CSS propio, sin frameworks):

| Capa | Piezas |
|---|---|
| `componentes/` | `Banner` (barra superior: marca, notificaciones, avatar) · `MenuLateral` (colapsable 88px⇄270px, fijo, ≤98vh) · `Boton`, `CampoTexto`, `iconos.ts` (SVG inline) |
| `pantallas/` | `Login` (acceso OTP, card al 75% del alto, sin scroll) · `Inicio` (tarjeta de bienvenida + widget de estado) |

Rutas (`cliente/src/routes/`):

- `/login` → pantalla de login. Si ya hay sesión, redirige a `/` (`login/+page.server.ts`).
- `(app)/` → **grupo protegido**: su `+layout.server.ts` redirige a `/login` si no hay
  sesión (guard real, no solo UI). El `+layout.svelte` monta `Banner` + `MenuLateral`.
- `(app)/` → `/` pantalla de bienvenida · `(app)/clientes` → gestiones de clientes.

## Desarrollo local (sin contenedores)

Para iterar con HMR sin reconstruir imágenes: PostgreSQL en Docker y los dos
servidores de Vite en paralelo. No hace falta ningún script extra.

```bash
docker run -d --name crm-postgres-dev -e POSTGRES_USER=crm -e POSTGRES_PASSWORD=crm \
  -e POSTGRES_DB=crmdb -p 5433:5432 postgres:17-alpine

cd servidor && npm run dev   # http://127.0.0.1:8080 (aplica migraciones y seed)
cd cliente && npm run dev    # http://127.0.0.1:5173
```

`servidor/.env` sigue siendo la única fuente de credenciales: el `DATABASE_URL` de
desarrollo ya apunta a `localhost:5433`, que es el puerto publicado arriba.

## Detalles técnicos

- **SvelteKit 3**: `$lib` fue eliminado, se usa `#lib` (campo `imports` de `package.json`).
  La configuración vive en `vite.config.ts` (sin `svelte.config.js`).
  Tres reglas de sintaxis de la v3 verificadas contra la doc oficial
  (<https://svelte.dev/docs/kit/migrating-to-sveltekit-3>):
  1. Los imports `#lib/*` **deben llevar la extensión del módulo** (`.ts`, `.svg`, ...).
     Vite los resuelve igual sin ella, pero el typechecker de TypeScript 6 con subpath
     imports nativos no: `import { db } from '#lib/server/base-datos/index.ts'`.
  2. Los módulos `$env/*` fueron deprecados. Las variables privadas se declaran en
     `servidor/src/env.ts` con `defineEnvVars` y se importan desde
     `$app/env/private`. Por defecto son **dinámicas** (se leen en runtime, no en el
     build), así Docker sigue inyectando `DATABASE_URL` al arrancar. Una variable es
     opcional si su `schema` puede devolver `undefined`.
   3. Los tipos de hooks (`Handle`, etc.) se importan desde `@sveltejs/kit/hooks`,
      no desde `@sveltejs/kit`.
  3. Los tipos de hooks (`Handle`, etc.) se importan desde `@sveltejs/kit/hooks`,
     no desde `@sveltejs/kit`.
- **Contenedor del backend con dos procesos**: `servidor/Dockerfile.db` parte de
  `postgres:17-bookworm` (misma versión mayor de PostgreSQL que la usada antes,
  para que el volumen `crm-pgdata` con datos siga siendo compatible), le añade
  Node.js, y `servidor/entrada.sh` arranca PostgreSQL en segundo plano, espera a
  que acepte conexiones y deja la API como PID 1. Así API y BD comparten
  contenedor y se comunican por `localhost:5432`.
- **adapter-node** en ambos proyectos para ejecutarse como servidor Node (`node build`).
- **Proxy del frontend**: reenvía el body como `ArrayBuffer` (no como stream) porque el
  `fetch` de Node exige `duplex: 'half'` para streams; y elimina cabeceras *hop-by-hop*
  (`Expect`, `Host`, `Content-Length`, ...). Sin esto, los POST/PUT fallan.
- **CSRF de SvelteKit**: las peticiones con método no-GET y content-type de formulario
  (`text/plain`, `x-www-form-urlencoded`) se bloquean si el `Origin` no coincide con el
  origin que ve el servidor. Al probar a mano con `curl`/Postman, usar `Content-Type: application/json`.
- **Docker Compose, dos proyectos**: `crm-backend` y `crm-frontend` viven en archivos
  separados para tener ciclos de vida independientes. Comparten la red **externa**
  `crm-net` (la crea `scripts/levantar.ps1`), así bajar uno no corta al otro. Sin
  `name:` propio, ambos archivos definirían el mismo proyecto (los dos están en
  `infra/`) y Compose trataría un servicio como huérfano del otro.
- **Placeholder de build**: `BETTER_AUTH_SECRET` se exige al compilar porque Better
  Auth valida el secreto al analizar las rutas. Las etapas de build definen un valor
  público y descartable; el real entra en runtime y `entrada.sh` aborta si falta.
