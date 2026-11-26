/**
 * Capa: Servicios (frontend) — apariencia de tablas y listas.
 *
 * La apariencia vive en el navegador (localStorage), igual que el tema. Si no
 * hay nada guardado se usa la apariencia por defecto que entrega el servidor
 * (o los valores de fábrica si tampoco hay configuración).
 *
 * Solo aplica al modo claro: en oscuro mandan los tokens del tema.
 */
import type { Apariencia } from '#lib/servicios-datos-api/configuracion.ts';

const CLAVE = 'crm-apariencia';
const ID_ESTILO = 'crm-apariencia-local';

export const APARIENCIA_POR_DEFECTO: Apariencia = {
	filaParFondo: '#e2e9f7',
	filaParTexto: '#111827',
	filaImparFondo: '#ffffff',
	filaImparTexto: '#111827',
	tablaLineaColor: '#e3e8f4',
	tablaLineaGrosor: 1,
	filaPaddingY: 2,
	listaLineaColor: '#e3e8f4',
	listaLineaGrosor: 1
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(valor: unknown, respaldo: string): string {
	return typeof valor === 'string' && HEX.test(valor) ? valor : respaldo;
}

function entero(valor: unknown, maximo: number, respaldo: number): number {
	const numero = Number(valor);
	if (!Number.isFinite(numero)) return respaldo;
	return Math.min(Math.max(Math.round(numero), 0), maximo);
}

/** Normaliza y acota una apariencia; un dato corrupto cae al valor por defecto. */
export function normalizarApariencia(valor: unknown): Apariencia {
	const datos = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
	return {
		filaParFondo: color(datos.filaParFondo, APARIENCIA_POR_DEFECTO.filaParFondo),
		filaParTexto: color(datos.filaParTexto, APARIENCIA_POR_DEFECTO.filaParTexto),
		filaImparFondo: color(datos.filaImparFondo, APARIENCIA_POR_DEFECTO.filaImparFondo),
		filaImparTexto: color(datos.filaImparTexto, APARIENCIA_POR_DEFECTO.filaImparTexto),
		tablaLineaColor: color(datos.tablaLineaColor, APARIENCIA_POR_DEFECTO.tablaLineaColor),
		tablaLineaGrosor: entero(datos.tablaLineaGrosor, 4, APARIENCIA_POR_DEFECTO.tablaLineaGrosor),
		filaPaddingY: entero(datos.filaPaddingY, 24, APARIENCIA_POR_DEFECTO.filaPaddingY),
		listaLineaColor: color(datos.listaLineaColor, APARIENCIA_POR_DEFECTO.listaLineaColor),
		listaLineaGrosor: entero(datos.listaLineaGrosor, 4, APARIENCIA_POR_DEFECTO.listaLineaGrosor)
	};
}

/** Apariencia guardada en este navegador, o `null` si no hay nada válido. */
export function leerAparienciaLocal(): Apariencia | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const crudo = localStorage.getItem(CLAVE);
		if (!crudo) return null;
		const datos = JSON.parse(crudo) as unknown;
		if (!datos || typeof datos !== 'object') return null;
		return normalizarApariencia(datos);
	} catch {
		return null;
	}
}

/** Persiste la apariencia de este navegador. */
export function guardarAparienciaLocal(apariencia: Apariencia): void {
	try {
		localStorage.setItem(CLAVE, JSON.stringify(normalizarApariencia(apariencia)));
	} catch {
		// Sin almacenamiento disponible: la apariencia vive solo en memoria.
	}
}

/** Borra la apariencia local: vuelve a la que define el servidor. */
export function borrarAparienciaLocal(): void {
	try {
		localStorage.removeItem(CLAVE);
	} catch {
		// sin almacenamiento
	}
}

/** CSS del override local (mayor especificidad que el fallback del layout). */
export function cssApariencia(apariencia: Apariencia): string {
	const a = normalizarApariencia(apariencia);
	return (
		'html[data-tema="claro"]{' +
		`--fila-par-fondo:${a.filaParFondo};` +
		`--fila-par-texto:${a.filaParTexto};` +
		`--fila-impar-fondo:${a.filaImparFondo};` +
		`--fila-impar-texto:${a.filaImparTexto};` +
		`--tabla-linea-color:${a.tablaLineaColor};` +
		`--tabla-linea-grosor:${a.tablaLineaGrosor}px;` +
		`--fila-padding-y:${a.filaPaddingY}px;` +
		`--lista-linea-color:${a.listaLineaColor};` +
		`--lista-linea-grosor:${a.listaLineaGrosor}px;` +
		'}'
	);
}

/**
 * Aplica (o quita) el override local en el documento. El estilo del layout es
 * el fallback; este se agrega después y gana por especificidad.
 */
export function aplicarAparienciaLocal(apariencia: Apariencia | null): void {
	if (typeof document === 'undefined') return;
	let estilo = document.getElementById(ID_ESTILO) as HTMLStyleElement | null;
	if (!apariencia) {
		estilo?.remove();
		return;
	}
	if (!estilo) {
		estilo = document.createElement('style');
		estilo.id = ID_ESTILO;
		document.head.appendChild(estilo);
	}
	estilo.textContent = cssApariencia(apariencia);
}
