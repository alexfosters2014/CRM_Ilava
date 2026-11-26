/**
 * Capa: Servicios — preferencias locales del navegador.
 *
 * Datos de trabajo que NO van a PostgreSQL: la fecha global de facturación y el
 * último período usado. Viven en IndexedDB (con respaldo en localStorage si el
 * navegador lo bloquea) para que sobrevivan a recargas y estén disponibles antes
 * de enviar las plantillas al Facturador.
 */

const NOMBRE_BASE = 'crm-preferencias';
const ALMACEN = 'preferencias';

let basePrometida: Promise<IDBDatabase | null> | null = null;

function abrirBase(): Promise<IDBDatabase | null> {
	if (basePrometida) return basePrometida;

	basePrometida = new Promise((resolver) => {
		if (typeof indexedDB === 'undefined') {
			resolver(null);
			return;
		}

		const pedido = indexedDB.open(NOMBRE_BASE, 1);
		pedido.onupgradeneeded = () => {
			const base = pedido.result;
			if (!base.objectStoreNames.contains(ALMACEN)) base.createObjectStore(ALMACEN);
		};
		pedido.onsuccess = () => resolver(pedido.result);
		pedido.onerror = () => resolver(null);
	});

	return basePrometida;
}

function leerRespaldo(clave: string): string | null {
	try {
		return localStorage.getItem(`crm-preferencias:${clave}`);
	} catch {
		return null;
	}
}

function guardarRespaldo(clave: string, valor: string) {
	try {
		localStorage.setItem(`crm-preferencias:${clave}`, valor);
	} catch {
		// Sin almacenamiento disponible: la preferencia vive solo en memoria.
	}
}

/** Lee una preferencia local (IndexedDB y, si falla, localStorage). */
export async function leerPreferencia(clave: string): Promise<string | null> {
	const base = await abrirBase();
	if (!base) return leerRespaldo(clave);

	return new Promise((resolver) => {
		const pedido = base.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(clave);
		pedido.onsuccess = () => resolver((pedido.result as string | undefined) ?? leerRespaldo(clave));
		pedido.onerror = () => resolver(leerRespaldo(clave));
	});
}

/** Guarda una preferencia local. */
export async function guardarPreferencia(clave: string, valor: string): Promise<void> {
	guardarRespaldo(clave, valor);

	const base = await abrirBase();
	if (!base) return;

	await new Promise<void>((resolver) => {
		const pedido = base.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).put(valor, clave);
		pedido.onsuccess = () => resolver();
		pedido.onerror = () => resolver();
	});
}
