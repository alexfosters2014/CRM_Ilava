import { asc, eq, isNull } from 'drizzle-orm';
import {
	db,
	gruposCobranza,
	gruposFacturacion,
	modalidadesCobranza,
	servicios,
	tiposCliente,
	tiposGestion,
	tiposGestionFacturacion
} from '../base-datos/index.ts';
import { normalizarTexto } from '../servicios/normalizar.ts';
import {
	detectarDuplicadosEnArchivo,
	faltantesCatalogosServicios,
	normalizarNumeracion,
	validarFilasServicios
} from '../servicios/importaciones.ts';
import { ErrorCatalogosFaltantes, ErrorFilasInvalidas } from '../servicios/importaciones.ts';
import type { FilaServicio } from '../validaciones/servicios.ts';

/**
 * Repositorio: servicios.
 *
 * El servicio se levanta desde su propio archivo de importación. Los catálogos
 * se resuelven contra los existentes: no se auto-crean.
 */

export interface ServicioListado {
	id: number;
	contactoFacturacion: string;
	nombreFantasia: string | null;
	numeracion: string | null;
	tipoNumeracion: string;
	grupoId: number;
	grupoNombre: string;
	grupoCobranzaId: number | null;
	grupoCobranza: string | null;
	tipoGestion: string;
	tipoCliente: string;
	modalidadCobranza: string;
	tipoGestionFacturacion: string;
	comentarioGestionFacturacion: string | null;
	/** Celular de WhatsApp normalizado (598 + 8 dígitos) o null. */
	celular: string | null;
	/** Plazo de pago en días (emisión → vencimiento). */
	cantidadDiasVencimiento: number;
	habilitado: boolean;
}

export interface ResumenImportacionServicios {
	filas: number;
	creados: number;
	duplicados: string[];
}

/** Lista los servicios vivos con sus catálogos resueltos. */
export async function listarServicios(): Promise<ServicioListado[]> {
	const filas = await db
		.select({
			id: servicios.id,
			contactoFacturacion: servicios.contactoFacturacion,
			nombreFantasia: servicios.nombreFantasia,
			numeracion: servicios.numeracion,
			tipoNumeracion: servicios.tipoNumeracion,
			grupoId: servicios.grupoId,
			grupoNombre: gruposFacturacion.nombre,
			grupoCobranzaId: servicios.grupoCobranzaId,
			grupoCobranza: gruposCobranza.nombre,
			tipoGestion: tiposGestion.nombre,
			tipoCliente: tiposCliente.nombre,
			modalidadCobranza: modalidadesCobranza.nombre,
			tipoGestionFacturacion: tiposGestionFacturacion.nombre,
			comentarioGestionFacturacion: servicios.comentarioGestionFacturacion,
			celular: servicios.celular,
			cantidadDiasVencimiento: servicios.cantidadDiasVencimiento,
			habilitado: servicios.habilitado
		})
		.from(servicios)
		.innerJoin(gruposFacturacion, eq(servicios.grupoId, gruposFacturacion.id))
		.leftJoin(gruposCobranza, eq(servicios.grupoCobranzaId, gruposCobranza.id))
		.innerJoin(tiposGestion, eq(servicios.tipoGestionId, tiposGestion.id))
		.innerJoin(tiposCliente, eq(servicios.tipoClienteId, tiposCliente.id))
		.innerJoin(modalidadesCobranza, eq(servicios.modalidadCobranzaId, modalidadesCobranza.id))
		.innerJoin(
			tiposGestionFacturacion,
			eq(servicios.tipoGestionFacturacionId, tiposGestionFacturacion.id)
		)
		.where(isNull(servicios.eliminadoEn))
		.orderBy(asc(servicios.contactoFacturacion));

	return filas;
}

/** Importa los servicios del archivo: valida, no duplica y no auto-crea catálogos. */
export async function importarServicios(filas: FilaServicio[]): Promise<ResumenImportacionServicios> {
	// 1. Reglas de numeración y campos obligatorios.
	const errores = validarFilasServicios(filas);
	if (errores.length > 0) throw new ErrorFilasInvalidas(errores);

	// 2. Duplicados dentro del archivo: se omiten y se informan.
	const duplicadosArchivo = new Set(detectarDuplicadosEnArchivo(filas));

	return db.transaction(async (tx) => {
		// 3. Catálogos disponibles (no se crean valores).
		const [gestionesDb, clientesDb, cobranzasDb, gestionesFacturacionDb, gruposDb] = await Promise.all([
			tx.select({ id: tiposGestion.id, nombre: tiposGestion.nombre, activo: tiposGestion.activo }).from(tiposGestion),
			tx.select({ id: tiposCliente.id, nombre: tiposCliente.nombre, activo: tiposCliente.activo }).from(tiposCliente),
			tx
				.select({ id: modalidadesCobranza.id, nombre: modalidadesCobranza.nombre, activo: modalidadesCobranza.activo })
				.from(modalidadesCobranza),
			tx
				.select({
					id: tiposGestionFacturacion.id,
					nombre: tiposGestionFacturacion.nombre,
					activo: tiposGestionFacturacion.activo
				})
				.from(tiposGestionFacturacion),
			tx
				.select({ id: gruposFacturacion.id, nombre: gruposFacturacion.nombre, activo: gruposFacturacion.activo })
				.from(gruposFacturacion)
		]);

		const activos = <T extends { activo: boolean }>(filas: T[]) => filas.filter((fila) => fila.activo);

		const disponibles = {
			gestion: new Set(activos(gestionesDb).map((fila) => normalizarTexto(fila.nombre))),
			cliente: new Set(activos(clientesDb).map((fila) => normalizarTexto(fila.nombre))),
			cobranza: new Set(activos(cobranzasDb).map((fila) => normalizarTexto(fila.nombre))),
			gestionFacturacion: new Set(activos(gestionesFacturacionDb).map((fila) => normalizarTexto(fila.nombre))),
			grupo: new Set(activos(gruposDb).map((fila) => normalizarTexto(fila.nombre)))
		};

		const faltantes = faltantesCatalogosServicios(filas, disponibles);
		if (Object.keys(faltantes).length > 0) throw new ErrorCatalogosFaltantes(faltantes);

		// Índices nombre → id para insertar.
		const idsGestion = await tx.select({ id: tiposGestion.id, nombre: tiposGestion.nombre }).from(tiposGestion);
		const idsCliente = await tx.select({ id: tiposCliente.id, nombre: tiposCliente.nombre }).from(tiposCliente);
		const idsCobranza = await tx
			.select({ id: modalidadesCobranza.id, nombre: modalidadesCobranza.nombre })
			.from(modalidadesCobranza);
		const idsGestionFacturacion = await tx
			.select({ id: tiposGestionFacturacion.id, nombre: tiposGestionFacturacion.nombre })
			.from(tiposGestionFacturacion);
		const idsGrupo = await tx
			.select({ id: gruposFacturacion.id, nombre: gruposFacturacion.nombre })
			.from(gruposFacturacion);

		const indice = (filas: { id: number; nombre: string }[]) =>
			new Map(filas.map((fila) => [normalizarTexto(fila.nombre), fila.id]));
		const porIdGestion = indice(idsGestion);
		const porIdCliente = indice(idsCliente);
		const porIdCobranza = indice(idsCobranza);
		const porIdGestionFacturacion = indice(idsGestionFacturacion);
		const porIdGrupo = indice(idsGrupo);

		// 4. Servicios existentes: los repetidos no se importan.
		const existentes = await tx
			.select({ contactoFacturacion: servicios.contactoFacturacion })
			.from(servicios);
		const yaExisten = new Set(existentes.map((fila) => normalizarTexto(fila.contactoFacturacion)));

		const duplicados = new Set<string>();
		let creados = 0;

		for (const fila of filas) {
			const contacto = fila.contacto.trim();
			const clave = normalizarTexto(contacto);

			if (duplicadosArchivo.has(clave) || yaExisten.has(clave)) {
				duplicados.add(contacto);
				continue;
			}

			const { numeracion, tipo } = normalizarNumeracion(fila.numeracion, fila.tipo);
			const id = (mapa: Map<string, number>, valor: string | null | undefined) =>
				mapa.get(normalizarTexto((valor ?? '').trim()))!;

			await tx.insert(servicios).values({
				contactoFacturacion: contacto,
				numeracion,
				tipoNumeracion: tipo,
				grupoId: id(porIdGrupo, fila.grupo),
				tipoGestionId: id(porIdGestion, fila.tipoGestion),
				tipoClienteId: id(porIdCliente, fila.tipoCliente),
				modalidadCobranzaId: id(porIdCobranza, fila.modalidadCobranza),
				tipoGestionFacturacionId: id(porIdGestionFacturacion, fila.tipoGestionFacturacion),
				habilitado: true
			});

			yaExisten.add(clave);
			creados += 1;
		}

		return { filas: filas.length, creados, duplicados: [...duplicados].sort() };
	});
}

/** Edita un servicio (switch de habilitado, numeración, grupo, gestión, etc.). */
export async function actualizarServicio(
	id: number,
	cambios: Partial<typeof servicios.$inferInsert>
): Promise<boolean> {
	const [actualizado] = await db
		.update(servicios)
		.set({ ...cambios, actualizadoEn: new Date() })
		.where(eq(servicios.id, id))
		.returning({ id: servicios.id });

	return Boolean(actualizado);
}
