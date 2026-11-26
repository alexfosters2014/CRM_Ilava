/**
 * Catálogo de permisos: ÚNICA fuente de verdad de las pantallas y opciones del
 * CRM.
 *
 * De acá se derivan solos:
 * 1. la grilla de switches del administrador,
 * 2. el menú lateral,
 * 3. las pestañas de Configuración,
 * 4. el guard de la API y el de las páginas.
 *
 * Agregar una pantalla = agregar una entrada acá + su ruta + su API. No hay
 * una segunda lista que actualizar, y los tests de cobertura fallan si una
 * ruta de `src/routes/api` queda sin llave.
 *
 * Reglas:
 * - `clave` es estable: se guarda en `permisos_usuario`. No se renombra.
 * - Solo se guardan HOJAS (entradas que nadie usa como `padre`).
 * - `api` son prefijos; si dos entradas comparten un prefijo, alcanza con
 *   tener UNA de las dos llaves (endpoints compartidos por varias pantallas).
 * - `apiExacta` matchea solo la ruta exacta, para que el agregado de
 *   Configuración no se convierta en un comodín de todo el subárbol.
 * - `soloAdmin` nunca aparece como switch: no se puede otorgar.
 */

export interface PantallaDef {
	clave: string;
	etiqueta: string;
	padre?: string;
	ruta?: string;
	api?: readonly string[];
	apiExacta?: readonly string[];
	icono?: string;
	orden: number;
	soloAdmin?: boolean;
}

export const PERMISOS: readonly PantallaDef[] = [
	{
		clave: 'inicio',
		etiqueta: 'Inicio / Resumen',
		ruta: '/principal',
		icono: 'inicio',
		orden: 10
	},
	{
		clave: 'multifacturador',
		etiqueta: 'Multifacturador',
		ruta: '/multifacturacion',
		icono: 'capas',
		// Facturas y plantillas son la misma pantalla. Los catálogos y los
		// parámetros de facturación también los consume el Facturador.
		api: ['/api/facturas', '/api/plantillas', '/api/variables', '/api/catalogos', '/api/configuracion/facturacion'],
		orden: 20
	},
	{
		clave: 'cobranza',
		etiqueta: 'Cobranza',
		ruta: '/cobranza',
		icono: 'enviar',
		api: [
			'/api/cobranza',
			'/api/configuracion/cobranza',
			'/api/configuracion/grupos-cobranza',
			'/api/emails',
			// Catálogos de referencia para la planilla de servicios faltantes.
			'/api/catalogos'
		],
		orden: 30
	},
	{
		clave: 'tickets',
		etiqueta: 'Tickets',
		ruta: '/tickets',
		icono: 'ticket',
		api: ['/api/tickets', '/api/notificaciones'],
		orden: 35
	},
	{
		clave: 'seguimientos',
		etiqueta: 'Seguimiento de cobranza',
		ruta: '/seguimientos',
		icono: 'seguimiento',
		api: ['/api/seguimientos', '/api/notificaciones'],
		orden: 36
	},
	{
		clave: 'servicios',
		etiqueta: 'Servicios',
		ruta: '/servicios',
		icono: 'servicio',
		// Comparte catálogos, emails y grupos de cobranza con otras pantallas.
		api: ['/api/servicios', '/api/emails', '/api/catalogos', '/api/cobranza/grupos-cobranza'],
		orden: 40	},
	{
		clave: 'clientes',
		etiqueta: 'Clientes',
		ruta: '/clientes',
		icono: 'clientes',
		api: ['/api/clientes'],
		orden: 50
	},
	{
		clave: 'configuracion',
		etiqueta: 'Configuración',
		ruta: '/configuracion',
		icono: 'config',
		// Solo el agregado exacto: los hijos tienen sus propias llaves y el
		// prefijo no debe concederlos todos.
		apiExacta: ['/api/configuracion'],
		orden: 90
	},
	{
		clave: 'configuracion.catalogos',
		etiqueta: 'Catálogos',
		padre: 'configuracion',
		api: ['/api/configuracion/catalogos'],
		orden: 10
	},
	{
		clave: 'configuracion.grupos',
		etiqueta: 'Grupos',
		padre: 'configuracion',
		// Los grupos de cobranza se administran desde Configuración y también
		// se crean desde el modal de Cobranza.
		api: ['/api/configuracion/grupos', '/api/configuracion/grupos-cobranza', '/api/cobranza/grupos-cobranza'],
		orden: 20
	},
	{
		clave: 'configuracion.apariencia',
		etiqueta: 'Apariencia',
		padre: 'configuracion',
		api: ['/api/configuracion/apariencia'],
		orden: 30
	},
	{
		clave: 'configuracion.facturacion',
		etiqueta: 'Facturación',
		padre: 'configuracion',
		api: ['/api/configuracion/facturacion'],
		orden: 40
	},
	{
		clave: 'configuracion.correo',
		etiqueta: 'Correo',
		padre: 'configuracion',
		api: ['/api/correo', '/api/gmail'],
		orden: 50
	},
	{
		clave: 'configuracion.whatsapp',
		etiqueta: 'WhatsApp',
		padre: 'configuracion',
		api: ['/api/whatsapp'],
		orden: 55,
		// Vincular el número equivale a entregar la cuenta de WhatsApp de la
		// empresa: solo lo hace un ADMIN.
		soloAdmin: true
	},
	{
		clave: 'configuracion.usuarios',
		etiqueta: 'Usuarios',
		padre: 'configuracion',
		api: ['/api/usuarios', '/api/areas', '/api/permisos'],
		orden: 60,
		// NUNCA otorgable: quien administra usuarios puede crearse un ADMIN.
		soloAdmin: true
	}
] as const satisfies readonly PantallaDef[];

/** Clave estable de pantalla u opción (validada contra el catálogo en runtime). */
export type ClavePermiso = string;

/** Todas las claves declaradas, en orden. */
export const CLAVES: readonly string[] = PERMISOS.map((p) => p.clave);

/**
 * Hojas: entradas que ninguna otra usa como padre. Son las únicas que se
 * guardan en `permisos_usuario`.
 */
export const HOJAS: readonly PantallaDef[] = PERMISOS.filter(
	(p) => !PERMISOS.some((hijo) => 'padre' in hijo && hijo.padre === p.clave)
);

export const CLAVES_HOJA: ReadonlySet<string> = new Set(HOJAS.map((p) => p.clave));

const POR_CLAVE = new Map<string, PantallaDef>(PERMISOS.map((p) => [p.clave, p as PantallaDef]));

export function definicionDe(clave: string): PantallaDef | undefined {
	return POR_CLAVE.get(clave);
}

export function esClaveValida(clave: string): boolean {
	return POR_CLAVE.has(clave);
}

export function esHoja(clave: string): boolean {
	return CLAVES_HOJA.has(clave);
}

/** Hijos directos de una clave (vacío si es hoja). */
export function hijosDe(clave: string): PantallaDef[] {
	return PERMISOS.filter((p) => 'padre' in p && p.padre === clave).sort((a, b) => a.orden - b.orden) as PantallaDef[];
}

/** Hojas que representa una clave: ella misma si es hoja, o todos sus descendientes. */
export function hojasDe(clave: string): string[] {
	if (esHoja(clave)) return [clave];
	return hijosDe(clave).flatMap((hijo) => hojasDe(hijo.clave));
}

/** Pantallas de primer nivel, en orden. */
export const PANTALLAS: readonly PantallaDef[] = PERMISOS.filter(
	(p) => !('padre' in p) || !p.padre
).sort((a, b) => a.orden - b.orden) as PantallaDef[];

/** Rutas de pantalla conocidas (para el guard de navegación del cliente). */
export const RUTAS: readonly { ruta: string; clave: string }[] = PERMISOS.filter(
	(p): p is PantallaDef & { ruta: string } => typeof p.ruta === 'string'
).map((p) => ({ ruta: p.ruta, clave: p.clave }));

// --- Índices de API derivados del catálogo -----------------------------------

const PREFIJOS = new Map<string, Set<string>>();
const EXACTAS = new Map<string, Set<string>>();

for (const permiso of PERMISOS) {
	for (const prefijo of permiso.api ?? []) {
		const llaves = PREFIJOS.get(prefijo) ?? new Set<string>();
		llaves.add(permiso.clave);
		PREFIJOS.set(prefijo, llaves);
	}
	for (const exacta of permiso.apiExacta ?? []) {
		const llaves = EXACTAS.get(exacta) ?? new Set<string>();
		llaves.add(permiso.clave);
		EXACTAS.set(exacta, llaves);
	}
}

/**
 * Llaves que habilitan una ruta de API. Junta TODO prefijo que matchee (no solo
 * el más largo), así un endpoint compartido acepta cualquiera de sus pantallas.
 * Devuelve un set vacío si la ruta no está declarada: el guard la rechaza.
 */
export function clavesDeApi(pathname: string): Set<string> {
	const llaves = new Set<string>();

	const exactas = EXACTAS.get(pathname);
	if (exactas) for (const clave of exactas) llaves.add(clave);

	for (const [prefijo, claves] of PREFIJOS) {
		if (pathname === prefijo || pathname.startsWith(`${prefijo}/`)) {
			for (const clave of claves) llaves.add(clave);
		}
	}

	return llaves;
}

/** Prefijos declarados, para el test de cobertura. */
export function prefijosDeclarados(): string[] {
	return [...PREFIJOS.keys(), ...EXACTAS.keys()];
}

/**
 * Valida el catálogo. Devuelve la lista de errores (vacía si está bien).
 * Se corre en los tests y al arrancar el servidor.
 */
export function validarCatalogo(): string[] {
	const errores: string[] = [];
	const vistas = new Set<string>();

	for (const permiso of PERMISOS) {
		if (vistas.has(permiso.clave)) errores.push(`Clave duplicada: ${permiso.clave}`);
		vistas.add(permiso.clave);

		if ('padre' in permiso && permiso.padre) {
			if (!POR_CLAVE.has(permiso.padre)) {
				errores.push(`${permiso.clave}: el padre ${permiso.padre} no existe`);
			}
			if (permiso.ruta) {
				errores.push(`${permiso.clave}: una opción de menú no puede tener ruta propia`);
			}
		}

		if (permiso.soloAdmin) {
			if (HOJAS.every((hoja) => hoja.clave !== permiso.clave)) {
				errores.push(`${permiso.clave}: soloAdmin debe ser una hoja`);
			}
			if ((permiso.api ?? []).length === 0 && (permiso.apiExacta ?? []).length === 0) {
				errores.push(`${permiso.clave}: una opción soloAdmin sin API es inalcanzable`);
			}
		}

		for (const prefijo of permiso.api ?? []) {
			if (!prefijo.startsWith('/api/')) errores.push(`${permiso.clave}: prefijo inválido ${prefijo}`);
		}
	}

	// Un prefijo no puede quedar declarado solo por una entrada soloAdmin y
	// otra normal: sería una puerta para el no-admin.
	for (const [prefijo, claves] of PREFIJOS) {
		const administradas = [...claves].filter((clave) => POR_CLAVE.get(clave)?.soloAdmin);
		const normales = [...claves].filter((clave) => !POR_CLAVE.get(clave)?.soloAdmin);
		if (administradas.length > 0 && normales.length > 0) {
			errores.push(`${prefijo}: mezcla permisos soloAdmin con permisos normales`);
		}
	}

	return errores;
}
