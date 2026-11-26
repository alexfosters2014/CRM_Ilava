import { and, asc, eq, sql } from 'drizzle-orm';
import {
	db,
	lotesEnvioCobranza,
	lotesEnvioCobranzaItems,
	servicios
} from '../base-datos/index.ts';
import { enviarEstadoCuenta } from './envios-cobranza.ts';
import { ErrorEnvioCorreo, verificarCuentaCorreo } from './correo.ts';
import { clasificarErrorCorreo, type ErrorCorreoClasificado } from '../servicios/correo-errores.ts';

/**
 * Cola de envíos masivos de cobranza.
 *
 * El procesamiento corre en el servidor: cerrar la pestaña del navegador no
 * interrumpe nada. Al arrancar, los ítems que quedaron en PROCESANDO se marcan
 * como reanudados y vuelven a PENDIENTE, así un reinicio no pierde envíos.
 */

const INTERVALO_MS = 1500;
const DEMORA_ENTRE_ENVIOS_MS = Number(process.env.ENVIOS_DELAY_MS ?? 1200);

let iniciada = false;
let enCiclo = false;

function dormir(ms: number) {
	return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Reanuda lo que haya quedado a medias por un reinicio del servidor. */
export async function reanudarEnviosPendientes() {
	const reanudados = await db
		.update(lotesEnvioCobranzaItems)
		.set({ estado: 'PENDIENTE', reanudado: true, actualizadoEn: new Date() })
		.where(eq(lotesEnvioCobranzaItems.estado, 'PROCESANDO'))
		.returning({ id: lotesEnvioCobranzaItems.id });
	return reanudados.length;
}

async function cerrarLoteSiCorresponde(loteId: number) {
	const restantes = await db.execute(sql`
		select count(*)::int as n
		from lotes_envio_cobranza_items
		where lote_id = ${loteId} and estado in ('PENDIENTE', 'PROCESANDO')
	`);
	const pendientes = Number((restantes.rows[0] as { n: number }).n ?? 0);
	if (pendientes === 0) {
		await db
			.update(lotesEnvioCobranza)
			.set({ estado: 'COMPLETADO', finalizadoEn: new Date() })
			.where(eq(lotesEnvioCobranza.id, loteId));
		return true;
	}
	return false;
}

/** Marca los pendientes como no intentados cuando el lote se corta por un error común. */
async function omitirPendientes(loteId: number, clasificacion: ErrorCorreoClasificado) {
	await db
		.update(lotesEnvioCobranzaItems)
		.set({
			estado: 'ERROR',
			error: `No se intentó: ${clasificacion.explicacion}`.slice(0, 500),
			errorTipo: clasificacion.tipo,
			actualizadoEn: new Date()
		})
		.where(
			and(
				eq(lotesEnvioCobranzaItems.loteId, loteId),
				eq(lotesEnvioCobranzaItems.estado, 'PENDIENTE')
			)
		);
}

/** Un paso de la cola: toma un ítem pendiente y lo envía. */
export async function procesarUnItem(): Promise<boolean> {
	if (enCiclo) return false;
	enCiclo = true;
	try {
		const [lote] = await db
			.select()
			.from(lotesEnvioCobranza)
			.where(sql`${lotesEnvioCobranza.estado} in ('PENDIENTE', 'EN_PROCESO')`)
			.orderBy(asc(lotesEnvioCobranza.creadoEn))
			.limit(1);
		if (!lote) return false;

		if (lote.estado === 'PENDIENTE') {
			await db
				.update(lotesEnvioCobranza)
				.set({ estado: 'EN_PROCESO', iniciadoEn: new Date() })
				.where(eq(lotesEnvioCobranza.id, lote.id));
		}

		if (!lote.plantillaId || !lote.cuentaId) {
			await db
				.update(lotesEnvioCobranzaItems)
				.set({ estado: 'ERROR', error: 'El lote no tiene plantilla o cuenta de correo', actualizadoEn: new Date() })
				.where(and(eq(lotesEnvioCobranzaItems.loteId, lote.id), eq(lotesEnvioCobranzaItems.estado, 'PENDIENTE')));
			await db
				.update(lotesEnvioCobranza)
				.set({ estado: 'COMPLETADO', finalizadoEn: new Date() })
				.where(eq(lotesEnvioCobranza.id, lote.id));
			return true;
		}

		const reclamo = await db.execute(sql`
			update lotes_envio_cobranza_items
			set estado = 'PROCESANDO', actualizado_en = now()
			where id = (
				select id from lotes_envio_cobranza_items
				where lote_id = ${lote.id} and estado = 'PENDIENTE'
				order by id
				limit 1
				for update skip locked
			)
			returning id, servicio_id
		`);
		const item = reclamo.rows[0] as { id: number; servicio_id: number } | undefined;
		if (!item) {
			await cerrarLoteSiCorresponde(lote.id);
			return false;
		}

		try {
			const envio = await enviarEstadoCuenta({
				servicioId: item.servicio_id,
				periodo: lote.periodo,
				plantillaId: lote.plantillaId,
				cuentaId: lote.cuentaId,
				aliasId: lote.aliasId ?? null,
				usuario: lote.usuario ?? undefined,
				verificarCredencial: false
			});
			await db
				.update(lotesEnvioCobranzaItems)
				.set({ estado: 'ENVIADO', envioId: envio.id, error: null, errorTipo: null, actualizadoEn: new Date() })
				.where(eq(lotesEnvioCobranzaItems.id, item.id));
		} catch (error) {
			const clasificacion =
				error instanceof ErrorEnvioCorreo ? error.clasificacion : clasificarErrorCorreo(error);
			await db
				.update(lotesEnvioCobranzaItems)
				.set({
					estado: 'ERROR',
					error: clasificacion.mensaje.slice(0, 500),
					errorTipo: clasificacion.tipo,
					intentos: sql`${lotesEnvioCobranzaItems.intentos} + 1`,
					actualizadoEn: new Date()
				})
				.where(eq(lotesEnvioCobranzaItems.id, item.id));

			// Si falla la credencial o el proveedor limita el envío, no tiene
			// sentido intentar los pendientes: se marcan como no intentados.
			if (clasificacion.tipo === 'AUTENTICACION' || clasificacion.tipo === 'LIMITE') {
				await omitirPendientes(lote.id, clasificacion);
			}
		}

		await dormir(DEMORA_ENTRE_ENVIOS_MS);
		await cerrarLoteSiCorresponde(lote.id);
		return true;
	} finally {
		enCiclo = false;
	}
}

/** Arranca el bucle de la cola (idempotente). */
export function iniciarColaEnvios() {
	if (iniciada) return;
	iniciada = true;
	void reanudarEnviosPendientes().catch((error) => {
		console.error('[cola-envios] no se pudo reanudar:', (error as Error).message);
	});
	setInterval(() => {
		void procesarUnItem().catch((error) => {
			console.error('[cola-envios] error de ciclo:', (error as Error).message);
		});
	}, INTERVALO_MS);
}

export interface CrearLote {
	periodo: string;
	servicioIds: number[];
	plantillaId: number;
	cuentaId: number;
	aliasId?: number | null;
	usuario?: string;
}

/** Crea el lote y sus ítems; el envío lo toma la cola en segundo plano. */
export async function crearLote(datos: CrearLote) {
	if (datos.servicioIds.length === 0) throw new Error('No hay servicios seleccionados');
	// Preflight: una sola verificación evita encolar 28 envíos condenados.
	const verificacion = await verificarCuentaCorreo(datos.cuentaId);
	if (!verificacion.ok) throw new Error(verificacion.clasificacion.explicacion);
	const [lote] = await db
		.insert(lotesEnvioCobranza)
		.values({
			periodo: datos.periodo,
			plantillaId: datos.plantillaId,
			cuentaId: datos.cuentaId,
			aliasId: datos.aliasId ?? null,
			usuario: datos.usuario,
			total: datos.servicioIds.length,
			estado: 'PENDIENTE'
		})
		.returning();
	await db
		.insert(lotesEnvioCobranzaItems)
		.values(datos.servicioIds.map((servicioId) => ({ loteId: lote.id, servicioId })))
		.onConflictDoNothing();
	return { id: lote.id, total: datos.servicioIds.length };
}

export interface ResumenLote {
	id: number;
	periodo: string;
	estado: string;
	total: number;
	enviados: number;
	errores: number;
	pendientes: number;
	procesando: number;
	creadoEn: string;
	finalizadoEn: string | null;
}

async function contar(loteId: number): Promise<Omit<ResumenLote, 'id' | 'periodo' | 'estado' | 'total' | 'creadoEn' | 'finalizadoEn'>> {
	const resultado = await db.execute(sql`
		select
			count(*) filter (where estado = 'ENVIADO')::int as enviados,
			count(*) filter (where estado = 'ERROR')::int as errores,
			count(*) filter (where estado = 'PENDIENTE')::int as pendientes,
			count(*) filter (where estado = 'PROCESANDO')::int as procesando
		from lotes_envio_cobranza_items
		where lote_id = ${loteId}
	`);
	const fila = resultado.rows[0] as { enviados: number; errores: number; pendientes: number; procesando: number };
	return {
		enviados: Number(fila?.enviados ?? 0),
		errores: Number(fila?.errores ?? 0),
		pendientes: Number(fila?.pendientes ?? 0),
		procesando: Number(fila?.procesando ?? 0)
	};
}

export async function resumenLote(loteId: number): Promise<ResumenLote | null> {
	const [lote] = await db.select().from(lotesEnvioCobranza).where(eq(lotesEnvioCobranza.id, loteId));
	if (!lote) return null;
	return {
		id: lote.id,
		periodo: lote.periodo,
		estado: lote.estado,
		total: lote.total,
		creadoEn: lote.creadoEn.toISOString(),
		finalizadoEn: lote.finalizadoEn ? lote.finalizadoEn.toISOString() : null,
		...(await contar(lote.id))
	};
}

export async function loteActivo(): Promise<ResumenLote | null> {
	const [lote] = await db
		.select()
		.from(lotesEnvioCobranza)
		.orderBy(sql`${lotesEnvioCobranza.id} desc`)
		.limit(1);
	if (!lote) return null;
	return resumenLote(lote.id);
}

export interface ItemLote {
	id: number;
	servicio: string;
	estado: string;
	error: string | null;
	errorTipo: string | null;
	intentos: number;
	reanudado: boolean;
	envioId: number | null;
}

export async function itemsLote(loteId: number): Promise<ItemLote[]> {
	const filas = await db
		.select({
			id: lotesEnvioCobranzaItems.id,
			servicio: servicios.contactoFacturacion,
			estado: lotesEnvioCobranzaItems.estado,
			error: lotesEnvioCobranzaItems.error,
			errorTipo: lotesEnvioCobranzaItems.errorTipo,
			intentos: lotesEnvioCobranzaItems.intentos,
			reanudado: lotesEnvioCobranzaItems.reanudado,
			envioId: lotesEnvioCobranzaItems.envioId
		})
		.from(lotesEnvioCobranzaItems)
		.innerJoin(servicios, eq(lotesEnvioCobranzaItems.servicioId, servicios.id))
		.where(eq(lotesEnvioCobranzaItems.loteId, loteId))
		.orderBy(asc(lotesEnvioCobranzaItems.id));
	return filas;
}
