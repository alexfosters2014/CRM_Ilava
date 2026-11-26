import { asc } from 'drizzle-orm';
import {
	articulos,
	db,
	gruposFacturacion,
	modalidadesCobranza,
	monedas,
	monedasTiposPrecio,
	tiposCliente,
	tiposComprobantes,
	tiposGestion,
	tiposGestionFacturacion,
	tiposPrecios
} from '../base-datos/index.ts';

/**
 * Repositorio: catálogos.
 *
 * Lectura de los catálogos que alimentan los formularios, filtros y la
 * importación de plantillas. Devuelve también los deshabilitados (con
 * `activo: false`) para que las pantallas puedan seguir mostrando el valor
 * actual de un registro aunque ya no se ofrezca para elegir.
 */

export interface Catalogos {
	grupos: {
		id: number;
		nombre: string;
		colorFondo: string;
		colorTexto: string;
		activo: boolean;
	}[];
	articulos: { id: number; codigo: string; descripcion: string; activo: boolean }[];
	tiposComprobantes: { id: number; nombre: string; abreviatura: string | null; activo: boolean }[];
	tiposPrecios: { id: number; nombre: string; activo: boolean }[];
	monedas: { id: number; codigo: string; activo: boolean }[];
	tiposGestion: { id: number; nombre: string; activo: boolean }[];
	tiposCliente: { id: number; nombre: string; activo: boolean }[];
	modalidadesCobranza: { id: number; nombre: string; activo: boolean }[];
	tiposGestionFacturacion: { id: number; nombre: string; activo: boolean }[];
	monedasTiposPrecio: { monedaId: number; tipoPrecioId: number }[];
}

/** Devuelve todos los catálogos ordenados para consumo del frontend. */
export async function listarCatalogos(): Promise<Catalogos> {
	const [
		grupos,
		articulosDb,
		comprobantes,
		precios,
		monedasDb,
		gestiones,
		clientes,
		cobranzas,
		gestionesFacturacion,
		paresMonedaPrecio
	] = await Promise.all([
		db
			.select({
				id: gruposFacturacion.id,
				nombre: gruposFacturacion.nombre,
				colorFondo: gruposFacturacion.colorFondo,
				colorTexto: gruposFacturacion.colorTexto,
				activo: gruposFacturacion.activo
			})
			.from(gruposFacturacion)
			.orderBy(asc(gruposFacturacion.id)),
		db
			.select({ id: articulos.id, codigo: articulos.codigo, descripcion: articulos.descripcion, activo: articulos.activo })
			.from(articulos)
			.orderBy(asc(articulos.codigo)),
		db
			.select({
				id: tiposComprobantes.id,
				nombre: tiposComprobantes.nombre,
				abreviatura: tiposComprobantes.abreviatura,
				activo: tiposComprobantes.activo
			})
			.from(tiposComprobantes)
			.orderBy(asc(tiposComprobantes.id)),
		db
			.select({ id: tiposPrecios.id, nombre: tiposPrecios.nombre, activo: tiposPrecios.activo })
			.from(tiposPrecios)
			.orderBy(asc(tiposPrecios.id)),
		db.select({ id: monedas.id, codigo: monedas.codigo, activo: monedas.activo }).from(monedas).orderBy(asc(monedas.id)),
		db.select({ id: tiposGestion.id, nombre: tiposGestion.nombre, activo: tiposGestion.activo }).from(tiposGestion).orderBy(asc(tiposGestion.id)),
		db.select({ id: tiposCliente.id, nombre: tiposCliente.nombre, activo: tiposCliente.activo }).from(tiposCliente).orderBy(asc(tiposCliente.id)),
		db
			.select({ id: modalidadesCobranza.id, nombre: modalidadesCobranza.nombre, activo: modalidadesCobranza.activo })
			.from(modalidadesCobranza)
			.orderBy(asc(modalidadesCobranza.id)),
		db
			.select({ id: tiposGestionFacturacion.id, nombre: tiposGestionFacturacion.nombre, activo: tiposGestionFacturacion.activo })
			.from(tiposGestionFacturacion)
			.orderBy(asc(tiposGestionFacturacion.id)),
		db
			.select({ monedaId: monedasTiposPrecio.monedaId, tipoPrecioId: monedasTiposPrecio.tipoPrecioId })
			.from(monedasTiposPrecio)
	]);

	return {
		grupos,
		articulos: articulosDb,
		tiposComprobantes: comprobantes,
		tiposPrecios: precios,
		monedas: monedasDb,
		tiposGestion: gestiones,
		tiposCliente: clientes,
		modalidadesCobranza: cobranzas,
		tiposGestionFacturacion: gestionesFacturacion,
		monedasTiposPrecio: paresMonedaPrecio
	};
}
