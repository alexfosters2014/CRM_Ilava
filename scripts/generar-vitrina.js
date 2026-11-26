/* Generador de la Vitrina de componentes de la Doc Maestra.
 *
 * Lee cada componente .svelte, extrae su template (HTML) y sus estilos (CSS)
 * reales y reemplaza el bloque VITRINA dentro de DOCUMENTACION.html.
 *
 * Uso:  node scripts/generar-vitrina.js
 * (correr después de tocar markup o estilos de un componente)
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DOC = path.join(RAIZ, 'DOCUMENTACION.html');

const COMPONENTES = [
  {
    nombre: 'Boton',
    archivo: 'cliente/src/lib/componentes/Boton.svelte',
    proposito: 'Botón base reutilizable: usa --color-primario, soporta disabled y hover. Props: tipo, deshabilitado, onclick, children (snippet).',
    vistaAjustes: '',
    vista: `
<div class="muestra">
  <button type="button">Guardar cambios</button>
  <button type="button" disabled>Enviando…</button>
</div>`
  },
  {
    nombre: 'CampoTexto',
    archivo: 'cliente/src/lib/componentes/CampoTexto.svelte',
    proposito: 'Etiqueta + input con foco resaltado. Props: valor (bindable), tipo, etiqueta, ph, autocomplete, largo (maxlength + inputmode numérico para OTP).',
    vistaAjustes: '',
    vista: `
<div class="muestra">
  <label class="campo">
    <span class="etiqueta">Código OTP</span>
    <input type="text" placeholder="6 dígitos" maxlength="6" inputmode="numeric" />
  </label>
  <label class="campo">
    <span class="etiqueta">Email</span>
    <input type="email" placeholder="nombre@empresa.com" />
  </label>
</div>`
  },
  {
    nombre: 'ChipAuxiliar',
    archivo: 'cliente/src/lib/componentes/ChipAuxiliar.svelte',
    proposito: 'Campo auxiliar EFactura en forma de chip. Solo se muestra si tiene valor. Con onclick se comporta como botón (abre el modal en ese campo). Props: etiqueta, valor, onclick, disabled.',
    vistaAjustes: '',
    vista: `
<div class="muestra">
  <span class="chip-aux" title="ID Compra: OC-2026-041">
    <span class="etiqueta">ID Compra</span><span class="valor">OC-2026-041</span>
  </span>
  <button type="button" class="chip-aux" title="UTE fecha vencimiento: 15/12/2026">
    <span class="etiqueta">UTE fecha vencimiento</span><span class="valor">15/12/2026</span>
  </button>
</div>`
  },
  {
    nombre: 'ChipSelect',
    archivo: 'cliente/src/lib/componentes/ChipSelect.svelte',
    proposito: 'Píldora con desplegable y buscador (si hay más de 6 opciones). Muestra la ABREVIATURA elegida; la lista muestra el nombre completo. Variantes de color: comprobante, moneda, precio. Props: valor, opciones, placeholder, variante, onchange, disabled, ariaLabel.',
    vistaAjustes: `.menu { position: static; margin-top: .3rem; }`,
    vista: `
<div class="muestra" style="align-items:flex-start">
  <div class="envoltorio">
    <button type="button" class="chip comprobante" aria-expanded="true">E-Factura</button>
    <div class="menu">
      <input placeholder="Buscar…" />
      <ul>
        <li><button type="button" class="activa">e-Factura</button></li>
        <li><button type="button">e-Ticket</button></li>
        <li><button type="button">Nota de crédito</button></li>
      </ul>
    </div>
  </div>
  <div class="muestra-col">
    <button type="button" class="chip moneda">UYU</button>
    <button type="button" class="chip precio">Venta</button>
    <button type="button" class="chip comprobante" disabled>E-Factura</button>
  </div>
</div>`
  },
  {
    nombre: 'CampoArticulo',
    archivo: 'cliente/src/lib/componentes/CampoArticulo.svelte',
    proposito: 'Input de código de artículo con pista de descripción debajo, borde rojo si el código no existe en el catálogo, y panel de sugerencias con F2 / Ctrl+K + flechas + Enter. Props: codigo, articulos, disabled, ariaLabel, oncommit.',
    vistaAjustes: '',
    vista: `
<div class="muestra" style="align-items:flex-start">
  <div class="campo-articulo" style="width:14rem">
    <div class="entrada-envoltorio">
      <input class="entrada" value="SUST-GNC" placeholder="Código" />
      <button type="button" class="btn-panel" title="Buscar código (F2)">⌄</button>
    </div>
    <span class="pista">Sustituto GNC — mantenimiento preventivo</span>
  </div>
  <div class="campo-articulo" style="width:14rem">
    <div class="entrada-envoltorio">
      <input class="entrada invalido" value="XYZ-999" placeholder="Código" />
      <button type="button" class="btn-panel" title="Buscar código (F2)">⌄</button>
    </div>
    <span class="pista invalido">No existe</span>
  </div>
  <div class="campo-articulo" style="width:14rem">
    <div class="entrada-envoltorio">
      <input class="entrada" value="MANT-C" placeholder="Código" />
      <button type="button" class="btn-panel" title="Buscar código (F2)">⌄</button>
    </div>
    <span class="pista">&nbsp;</span>
    <div class="panel" role="listbox">
      <button type="button" class="opcion activa" role="option"><strong>MANT-CLIMA</strong><span>Mantenimiento climatización</span></button>
      <button type="button" class="opcion" role="option"><strong>MANT-EDIF</strong><span>Mantenimiento edilicio</span></button>
    </div>
  </div>
</div>`
  },
  {
    nombre: 'Banner',
    archivo: 'cliente/src/lib/componentes/Banner.svelte',
    proposito: 'Barra superior presente en todas las pantallas autenticadas: marca a la izquierda, notificaciones (contador demo) y avatar con iniciales. Props: usuario.',
    vistaAjustes: `.banner { position: static; }`,
    vista: `
<header class="banner">
  <div class="marca">
    <span class="logo">⚡</span>
    <span class="nombre">FacturaPro</span>
    <span class="suite">CFDI 4.0 SUITE</span>
  </div>
  <div class="acciones">
    <button type="button" class="icono-btn" aria-label="Notificaciones">🔔<span class="badge">3</span></button>
    <span class="avatar" title="Perfil">AF</span>
  </div>
</header>`
  },
  {
    nombre: 'ModalPanel',
    archivo: 'cliente/src/lib/componentes/ModalPanel.svelte',
    proposito: 'Cascarón de modal 70vw × 70vh centrado con fondo difuminado; cierra con Escape o click afuera. Props: titulo, subtitulo, etiqueta, onCerrar, children (cuerpo), acciones (pie opcional).',
    vistaAjustes: `.fondo { position: relative; inset: auto; padding: .8rem; border-radius: .7rem; background: #eef0f6; backdrop-filter: none; -webkit-backdrop-filter: none; }
.panel { width: 100%; height: auto; max-height: none; box-shadow: 0 8px 24px rgba(19, 27, 56, .15); }`,
    vista: `
<div class="fondo">
  <div class="panel" role="dialog">
    <header class="cabecera">
      <div class="titulos">
        <span class="etiqueta">Bandeja</span>
        <h2>Enviados a facturar</h2>
        <p class="subtitulo">Facturas que ya salieron de la cola.</p>
      </div>
      <button type="button" class="cerrar" aria-label="Cerrar">×</button>
    </header>
    <div class="cuerpo">
      <p style="margin:0;color:#6b7794;font-size:.78rem">Contenido del panel (snippet children)…</p>
    </div>
    <footer class="pie">
      <button type="button" class="cerrar" style="padding:.35rem .9rem;width:auto;height:auto">Cerrar</button>
    </footer>
  </div>
</div>`
  },
  {
    nombre: 'ModalDocumento',
    archivo: 'cliente/src/lib/componentes/ModalDocumento.svelte',
    proposito: 'Modal único para editar una plantilla o factura completa: cabecera, datos de facturación (fecha opcional, comprobante, precio, serie, moneda), adena general, líneas de facturación (con copiar/eliminar y alta), campos auxiliares EFactura y pie con total. Cada campo guarda al salir (blur) o al cambiar (select). Props clave: documento, articulos, opciones*, soloLectura, onCabecera, onLinea, onAgregar, onEliminar, mostrarFecha, onMarcarPendiente, onEliminarDocumento.',
    vistaAjustes: `.fondo-modal { position: relative; inset: auto; padding: .8rem; border-radius: .7rem; background: #eef0f6; }
.modal { width: 100%; height: auto; max-height: none; box-shadow: 0 8px 24px rgba(19, 27, 56, .15); }`,
    vista: `
<div class="fondo-modal">
  <div class="modal" role="dialog">
    <header class="modal-cabecera">
      <div><h2>Servicios Empresa Ejemplo S.A. (14)</h2><p class="subtitulo">Plantilla de facturación</p></div>
      <button type="button" class="btn-cerrar" aria-label="Cerrar">×</button>
    </header>
    <div class="modal-cuerpo">
      <div class="etiquetas">
        <span class="etiqueta-info"><b>Gestión</b> NORMAL</span>
        <span class="etiqueta-info"><b>Cobranza</b> DÉBITO</span>
      </div>
      <section class="bloque">
        <h3>Datos de facturación</h3>
        <div class="grilla">
          <label class="campo"><span>Fecha</span><input type="text" value="31/10/2026" /></label>
          <label class="campo"><span>Tipo de comprobante</span><select><option>e-Factura</option></select></label>
          <label class="campo"><span>Tipo de precio</span><select><option>Venta</option></select></label>
          <label class="campo"><span>Serie</span><input type="text" value="A" /></label>
          <label class="campo"><span>Moneda</span><select><option>UYU</option></select></label>
        </div>
        <label class="campo">
          <span>Adenda / comentario general</span>
          <textarea rows="2">Servicio mensual de {{periodo}}</textarea>
        </label>
      </section>
      <section class="bloque">
        <h3>Líneas de facturación</h3>
        <div class="tabla-lineas">
          <div class="fila-linea cabecera"><span>Código</span><span>Detalle</span><span class="numero">Cantidad</span><span class="numero">Importe</span><span></span></div>
          <div class="fila-linea">
            <span class="celda-codigo"><input class="entrada" value="SUST-GNC" /></span>
            <span><input class="entrada" value="Sustituto GNC" /></span>
            <span><input class="entrada numero" value="1" /></span>
            <span><input class="entrada numero" value="1.250,00" /></span>
            <span class="acciones"><button type="button" class="btn-copiar" title="Copiar línea">⧉</button><button type="button" class="btn-baja" title="Eliminar línea">×</button></span>
          </div>
          <div class="fila-linea">
            <span class="celda-codigo"><input class="entrada" value="MANT-CLIMA" /></span>
            <span><input class="entrada" value="Mantenimiento climatización" /></span>
            <span><input class="entrada numero" value="2" /></span>
            <span><input class="entrada numero" value="890,50" /></span>
            <span class="acciones"><button type="button" class="btn-copiar" title="Copiar línea">⧉</button><button type="button" class="btn-baja" title="Eliminar línea">×</button></span>
          </div>
        </div>
        <div class="alta">
          <strong>Agregar línea</strong>
          <div class="alta-grilla">
            <div class="campo-alta"><input class="entrada" placeholder="Código" /></div>
            <input class="entrada numero" placeholder="Cantidad" />
            <input class="entrada numero" placeholder="Importe" />
            <button type="button" class="btn-agregar">Agregar</button>
          </div>
        </div>
      </section>
      <section class="bloque auxiliares">
        <h3>Campos auxiliares</h3>
        <p class="ayuda">Se envían a EFactura y no se imprimen en el cuerpo de la factura.</p>
        <div class="grilla">
          <label class="campo"><span>EFactura: ID Compra</span><input type="text" value="OC-2026-041" /></label>
          <label class="campo"><span>UTE fecha vencimiento</span><input type="text" value="15/12/2026" /></label>
          <label class="campo"><span>Detalle</span><input type="text" /></label>
          <label class="campo"><span>Información adicional</span><input type="text" /></label>
        </div>
      </section>
    </div>
    <footer class="modal-pie">
      <span class="total">Total: <strong>$ 3.031,00</strong></span>
      <div class="acciones-pie">
        <button type="button" class="btn-pie">Marcar pendiente</button>
        <button type="button" class="btn-pie peligro">Eliminar factura</button>
        <button type="button" class="btn-cerrar-pie">Cerrar</button>
      </div>
    </footer>
  </div>
</div>`
  },
  {
    nombre: 'ModalEnviadosFacturar',
    archivo: 'cliente/src/lib/componentes/ModalEnviadosFacturar.svelte',
    proposito: 'Histórico de facturas enviadas a facturar (FACTURADO + COBRADO con fecha): tabla con fecha/hora/vía/número/servicio/ítems/adenda; globo con detalle de líneas al pasar el mouse; "Limpiar" marca visto sin borrar. Props: onCerrar.',
    vistaAjustes: '',
    vista: `
<div class="muestra-col">
  <table class="tabla">
    <thead><tr><th>Fecha</th><th>Hora</th><th>Vía</th><th>Factura</th><th>Servicio</th><th class="centro">Ítems</th><th>Adenda</th></tr></thead>
    <tbody>
      <tr>
        <td class="ahora">05/11/2026</td><td class="ahora">14:32</td>
        <td><span class="via via-multifacturacion">Multifacturación</span></td>
        <td class="numero">A-1</td><td class="servicio">Servicios Empresa Ejemplo S.A.</td>
        <td class="centro"><button type="button" class="items">2</button></td>
        <td class="adenda" title="Servicio mensual octubre">Servicio mensual octubre</td>
      </tr>
      <tr>
        <td class="ahora">05/11/2026</td><td class="ahora">14:32</td>
        <td><span class="via via-api">API</span></td>
        <td class="numero">A-2</td><td class="servicio">Clima Sur SRL</td>
        <td class="centro"><button type="button" class="items">1</button></td>
        <td class="adenda">—</td>
      </tr>
    </tbody>
  </table>
  <div style="display:flex;gap:.5rem">
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.68rem;color:#4a5680"><input type="checkbox" checked /> Ver también los ya vistos</label>
    <button type="button" class="btn-limpiar" style="margin-left:auto">Limpiar (2)</button>
  </div>
</div>`
  }
];

function extraer(contenido) {
  const iStyle = contenido.indexOf('<style>');
  const iFinStyle = contenido.lastIndexOf('</style>');
  const css = iStyle >= 0 && iFinStyle > iStyle
    ? contenido.slice(iStyle + '<style>'.length, iFinStyle).trim()
    : '';
  const iScript = contenido.lastIndexOf('</script>');
  let html = iScript >= 0
    ? contenido.slice(iScript + '</script>'.length, iStyle >= 0 ? iStyle : contenido.length)
    : '';
  return { html: html.trim(), css };
}

const vitrina = COMPONENTES.map((c) => {
  const ruta = path.join(RAIZ, c.archivo);
  if (!fs.existsSync(ruta)) {
    console.error('No existe: ' + ruta);
    process.exit(1);
  }
  const contenido = fs.readFileSync(ruta, 'utf8');
  const lineas = contenido.split(/\r?\n/).length;
  const { html, css } = extraer(contenido);
  return {
    nombre: c.nombre,
    archivo: c.archivo,
    lineas,
    proposito: c.proposito,
    vista: c.vista.trim(),
    vistaAjustes: (c.vistaAjustes || '').trim(),
    html,
    css
  };
});

let json = JSON.stringify(vitrina, null, 2);
// Seguridad para incrustar en <script>: evitar cierres tempranos del parser HTML.
json = json.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
const bloque = 'const VITRINA = ' + json + ';';

const doc = fs.readFileSync(DOC, 'utf8');
const ini = '/*VITRINA-INICIO*/';
const fin = '/*VITRINA-FIN*/';
const a = doc.indexOf(ini);
const b = doc.indexOf(fin);
if (a < 0 || b < 0 || b <= a) {
  console.error('Marcadores VITRINA no encontrados en DOCUMENTACION.html');
  process.exit(1);
}
const nuevo = doc.slice(0, a + ini.length) + '\n' + bloque + '\n' + doc.slice(b);
fs.writeFileSync(DOC, nuevo, 'utf8');
console.log('Vitrina generada: ' + vitrina.length + ' componentes -> DOCUMENTACION.html');
