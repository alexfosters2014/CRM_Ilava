import { normalizarTexto } from './normalizar.ts';
import type { TipoNumeracion } from '../base-datos/esquemas/servicios.ts';

/**
 * Capa: Servicios — reglas puras de las importaciones (sin base de datos).
 *
 * - Los catálogos NO se auto-crean: se validan contra los valores existentes y
 *   se informan los faltantes.
 * - Los servicios no se duplican: nombre normalizado como identidad.
 * - La numeración (RUT/CI) es texto; sin numeración el tipo es SIN_NUMERACION.
 */

export interface FaltantesCatalogos {
	[catalogo: string]: string[];
}

/** El archivo referencia valores de catálogo que todavía no existen. */
export class ErrorCatalogosFaltantes extends Error {
	readonly faltantes: FaltantesCatalogos;

	constructor(faltantes: FaltantesCatalogos) {
		super('Hay valores de catálogo que no están ingresados');
		this.name = 'ErrorCatalogosFaltantes';
		this.faltantes = faltantes;
	}
}

/** Alguna fila no cumple las reglas de la numeración u otro campo. */
export class ErrorFilasInvalidas extends Error {
	readonly detalles: { fila: number; mensaje: string }[];

	constructor(detalles: { fila: number; mensaje: string }[]) {
		super('El archivo tiene filas inválidas');
		this.name = 'ErrorFilasInvalidas';
		this.detalles = detalles;
	}
}

interface FilaServicio {
	contacto: string;
	numeracion?: string | null;
	tipo?: string | null;
	tipoGestion?: string | null;
	tipoCliente?: string | null;
	modalidadCobranza?: string | null;
	grupo?: string | null;
	tipoGestionFacturacion?: string | null;
}

/** Regla de numeración: sin numeración → SIN_NUMERACION; con numeración, tipo obligatorio. */
export function normalizarNumeracion(
	numeracion: string | null | undefined,
	tipo: string | null | undefined
): { numeracion: string | null; tipo: TipoNumeracion; error: string | null } {
	const numeracionLimpia = (numeracion ?? '').trim();
	const tipoLimpio = (tipo ?? '').trim().toUpperCase();

	if (!numeracionLimpia) {
		return { numeracion: null, tipo: 'SIN_NUMERACION', error: null };
	}

	const validos: TipoNumeracion[] = ['RUT', 'CEDULA', 'OTROS'];
	if (!tipoLimpio) {
		return {
			numeracion: null,
			tipo: 'SIN_NUMERACION',
			error: 'Hay numeración sin TIPO: indicá RUT, CEDULA u OTROS'
		};
	}
	if (!validos.includes(tipoLimpio as TipoNumeracion)) {
		return {
			numeracion: null,
			tipo: 'SIN_NUMERACION',
			error: `TIPO desconocido: "${tipo?.trim()}". Los valores válidos son RUT, CEDULA u OTROS`
		};
	}

	return { numeracion: numeracionLimpia, tipo: tipoLimpio as TipoNumeracion, error: null };
}

/** Valida las filas del archivo de servicios y devuelve los errores por fila. */
export function validarFilasServicios(filas: FilaServicio[]): { fila: number; mensaje: string }[] {
	const errores: { fila: number; mensaje: string }[] = [];

	filas.forEach((fila, indice) => {
		const numeroFila = indice + 1;
		if (!fila.contacto?.trim()) {
			errores.push({ fila: numeroFila, mensaje: 'Falta el contacto' });
			return;
		}

		const numeracion = normalizarNumeracion(fila.numeracion, fila.tipo);
		if (numeracion.error) {
			errores.push({ fila: numeroFila, mensaje: numeracion.error });
		}
	});

	return errores;
}

/** Nombres (normalizados) que aparecen más de una vez dentro del archivo. */
export function detectarDuplicadosEnArchivo(filas: { contacto: string }[]): string[] {
	const conteos = new Map<string, number>();
	for (const fila of filas) {
		const nombre = fila.contacto?.trim();
		if (!nombre) continue;
		const clave = normalizarTexto(nombre);
		conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
	}
	return [...conteos.entries()].filter(([, total]) => total > 1).map(([clave]) => clave);
}

/** Acumula un valor faltante por catálogo sin repetirlo. */
function acumularFaltantes(faltantes: FaltantesCatalogos, catalogo: string, valor: string) {
	const lista = faltantes[catalogo] ?? (faltantes[catalogo] = []);
	const etiqueta = valor === '' ? '(vacío)' : valor;
	if (!lista.includes(etiqueta)) lista.push(etiqueta);
}

/** Catálogos que exige el archivo de SERVICIOS y los valores que faltan. */
export function faltantesCatalogosServicios(
	filas: FilaServicio[],
	disponibles: {
		gestion: Set<string>;
		cliente: Set<string>;
		cobranza: Set<string>;
		gestionFacturacion: Set<string>;
		grupo: Set<string>;
	}
): FaltantesCatalogos {
	const faltantes: FaltantesCatalogos = {};

	for (const fila of filas) {
		for (const [campo, catalogo, conjunto] of [
			[fila.tipoGestion, 'TIPO_GESTION', disponibles.gestion],
			[fila.tipoCliente, 'TIPO_CLIENTE', disponibles.cliente],
			[fila.modalidadCobranza, 'MODALIDAD_COBRANZA', disponibles.cobranza],
			[fila.tipoGestionFacturacion, 'GESTION_FACTURACION', disponibles.gestionFacturacion],
			[fila.grupo, 'GRUPO', disponibles.grupo]
		] as [string | null | undefined, string, Set<string>][]) {
			const valor = (campo ?? '').trim();
			if (!valor) {
				acumularFaltantes(faltantes, catalogo, '');
				continue;
			}
			if (!conjunto.has(normalizarTexto(valor))) {
				acumularFaltantes(faltantes, catalogo, valor);
			}
		}
	}

	return faltantes;
}

interface FilaPlantilla {
	moneda?: string | null;
	tipoComprobante?: string | null;
	tipoPrecio?: string | null;
	articuloCodigo: string;
}

/** Catálogos que exige el archivo de PLANTILLAS y los valores que faltan. */
export function faltantesCatalogosPlantillas(
	filas: FilaPlantilla[],
	disponibles: { moneda: Set<string>; comprobante: Set<string>; precio: Set<string>; articulo: Set<string> }
): FaltantesCatalogos {
	const faltantes: FaltantesCatalogos = {};

	for (const fila of filas) {
		for (const [campo, catalogo, conjunto] of [
			[fila.moneda, 'MONEDA', disponibles.moneda],
			[fila.tipoComprobante, 'TIPO_COMPROBANTE', disponibles.comprobante],
			[fila.tipoPrecio, 'TIPO_PRECIO', disponibles.precio],
			[fila.articuloCodigo, 'ARTICULO', disponibles.articulo]
		] as [string | null | undefined, string, Set<string>][]) {
			const valor = (campo ?? '').trim();
			if (!valor) {
				acumularFaltantes(faltantes, catalogo, '');
				continue;
			}
			if (!conjunto.has(normalizarTexto(valor))) {
				acumularFaltantes(faltantes, catalogo, valor);
			}
		}
	}

	return faltantes;
}
