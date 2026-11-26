/**
 * Capa: Componentes — iconos.
 *
 * Mapa de iconos SVG inline (sin librerías externas). Cada valor es el markup
 * completo de un <svg> 24x24 con stroke=currentColor, para poder inyectarlo con
 * `{@html}` donde haga falta. Es estático (no hay input de usuario), por lo que
 * {@html} es seguro acá.
 */
const svg = (cuerpo: string, relleno = false) =>
	`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${relleno ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;

export const iconos: Record<string, string> = {
	rayo: svg('<path d="M13 2 3 14h7l-1 8 11-12h-7l1-8z"/>', true),
	campana: svg(
		'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
	),
	inicio: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>'),
	factura: svg(
		'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>'
	),
	capas: svg(
		'<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 17 12 21.5 21 17"/>'
	),
	clientes: svg(
		'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
	),
	servicio: svg(
		'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'
	),
	reportes: svg('<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="13" y="7" width="3" height="10"/>'),
	config: svg(
		'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
	),
	chevron: svg('<path d="M15 18l-6-6 6-6"/>'),
	salir: svg(
		'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
	),
	candado: svg(
		'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
	),
	correo: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>'),
	flecha: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
	tilda: svg('<path d="M20 6 9 17l-5-5"/>'),
	centro: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'),
	ticket: svg(
		'<path d="M3 9a2 2 0 0 0 2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v2a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2a2 2 0 0 0-2-2z"/><path d="M14 4v3"/><path d="M14 17v3"/><path d="M14 11v2"/>'
	),
	seguimiento: svg(
		'<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.8-.9L3 21l2.1-5.6a8.3 8.3 0 0 1-1-4.1A8.4 8.4 0 0 1 12.6 3 8.4 8.4 0 0 1 21 11.5z"/><path d="m8.5 11.5 2.3 2.3 4.7-4.6"/>'
	),
	telefono: svg(
		'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>'
	),
	reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
	alerta: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
	arroba: svg('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>'),
	checkCirculo: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'),
	equis: svg('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'),
	puntos: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>', true),
	enlace: svg('<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>'),
	calendario: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/>'),
	etiqueta: svg('<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor"/>'),
	edificio: svg('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1"/><path d="M14 7h1"/><path d="M9 11h1"/><path d="M14 11h1"/><path d="M9 15h1"/><path d="M14 15h1"/><path d="M9 21v-3h6v3"/>'),
	ojo: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
	orden: svg('<path d="M3 6h12"/><path d="M3 12h9"/><path d="M3 18h6"/><path d="M18 9l3-3 3 3"/><path d="M21 6v12"/>'),
	info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
	corona: svg('<path d="m3 7 4 3 5-6 5 6 4-3-2 12H5z"/>'),
	pin: svg('<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
	escudo: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
	responder: svg('<path d="M9 17 4 12l5-5"/><path d="M20 18v-5a4 4 0 0 0-4-4H4"/>'),
	exterior: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'),
	usuario: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
	usuarios: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
	ordenar: svg('<path d="M3 6h12"/><path d="M3 12h9"/><path d="M3 18h6"/>'),
	gota: svg('<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z"/>'),
	recargar: svg(
		'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'
	),
	buscar: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
	mas: svg('<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'),
	agregar: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
	chevronAbajo: svg('<path d="m6 9 6 6 6-6"/>'),
	lapiz: svg(
		'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'
	),
	papelera: svg(
		'<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'
	),
	copiar: svg(
		'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
	),
	enviar: svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'),
	descargar: svg(
		'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'
	),
	// Alertas de mora de Cobranza: reloj amarillo 1-2 meses, círculo naranja 3-5,
	// triángulo rojo más de 5. Los colores van fijos en el SVG, no por CSS.
	alertaReloj: svg(
		'<circle cx="12" cy="12" r="10.4" fill="#F5C400" stroke="#1F2937" stroke-width="2.2"/><path d="M12 12V5.8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M12 12l4.2 3.4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="2.1" fill="#fff"/>'
	),
	alertaNaranja: svg(
		'<circle cx="12" cy="12" r="10.4" fill="#F58220" stroke="#1F2937" stroke-width="2.2"/><rect x="10.7" y="5.8" width="2.6" height="8.4" rx="1.3" fill="#fff"/><circle cx="12" cy="17.6" r="1.55" fill="#fff"/>'
	),
	alertaRojo: svg(
		'<path d="M12 2.2 22.1 19.8c.6 1.05-.15 2.35-1.36 2.35H3.26c-1.21 0-1.96-1.3-1.36-2.35Z" fill="#D21F1F" stroke="#D21F1F" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 6.2 19.3 19H4.7Z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><rect x="10.9" y="9.2" width="2.2" height="5.1" rx="1.1" fill="#fff"/><circle cx="12" cy="16.9" r="1.2" fill="#fff"/>'
	)
};
