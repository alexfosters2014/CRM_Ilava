import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
	auditoriaCobranza,
	db,
	importacionesEmails,
	servicios,
	serviciosEmails
} from '../base-datos/index.ts';
import {
	combinarUso,
	emailsInvalidos,
	esUsoEmail,
	modoEmails,
	normalizarEmails,
	usosDeLista,
	type ListaEmail,
	type ModoEmails,
	type UsoEmail
} from '../servicios/emails.ts';
import {
	diferenciarEmails,
	hayCambios,
	leerCeldaEmails,
	type CambiosEmails,
	type EmailActual
} from '../servicios/emails-importacion.ts';

/**
 * Repositorio: emails del servicio (facturación y cobranza).
 *
 * Una sola fila por mail con su destino en `uso`; los listados se resuelven
 * filtrando, sin copias ni sincronización. El modo del servicio se deriva y
 * nunca se persiste, así no puede contradecir a las filas.
 */

export interface EmailServicioListado {
	id: number;
	email: string;
	uso: UsoEmail;
	activo: boolean;
}

export interface EmailsServicio {
	servicioId: number;
	modo: ModoEmails;
	emails: EmailServicioListado[];
}

const columnas = {
	id: serviciosEmails.id,
	email: serviciosEmails.email,
	uso: serviciosEmails.uso,
	activo: serviciosEmails.activo
};

/** Todos los mails activos del servicio, con su destino. */
export async function listarEmailsServicio(servicioId: number): Promise<EmailsServicio> {
	const emails = await db
		.select(columnas)
		.from(serviciosEmails)
		.where(and(eq(serviciosEmails.servicioId, servicioId), eq(serviciosEmails.activo, true)))
		.orderBy(asc(serviciosEmails.email));
	return {
		servicioId,
		modo: modoEmails(emails.map((email) => email.uso)),
		emails
	};
}

/**
 * Destinatarios de un listado concreto.
 *
 * Cobranza lee COMPARTIDO + COBRANZA; facturación, COMPARTIDO + FACTURACION.
 */
export async function emailsParaEnvio(servicioId: number, lista: ListaEmail): Promise<string[]> {
	const filas = await db
		.select({ email: serviciosEmails.email })
		.from(serviciosEmails)
		.where(
			and(
				eq(serviciosEmails.servicioId, servicioId),
				eq(serviciosEmails.activo, true),
				inArray(serviciosEmails.uso, usosDeLista(lista))
			)
		)
		.orderBy(asc(serviciosEmails.email));
	return filas.map((fila) => fila.email);
}

export interface ResumenAltaEmails {
	agregados: number;
	existentes: number;
	reactivados: number;
	compartidos: number;
	emails: string[];
}

/**
 * Agrega varios mails a un listado.
 *
 * Si el mail ya existía para el otro listado, pasa a COMPARTIDO: la operación
 * nunca lo saca de donde ya estaba. Si estaba dado de baja, se reactiva.
 * Si algún email es inválido no se agrega ninguno (para no guardar typos).
 */
export async function agregarEmailsServicio(
	servicioId: number,
	emails: string[],
	uso: UsoEmail,
	usuario?: string
): Promise<ResumenAltaEmails> {
	if (!esUsoEmail(uso)) throw new Error('Destino de email inválido');
	const normalizados = normalizarEmails(emails);
	if (normalizados.length === 0) throw new Error('Ingresá al menos un email');
	const invalidos = emailsInvalidos(normalizados);
	if (invalidos.length > 0) throw new Error(`Email inválido: ${invalidos.join(', ')}`);

	const actuales = await db
		.select(columnas)
		.from(serviciosEmails)
		.where(eq(serviciosEmails.servicioId, servicioId));
	const porEmail = new Map(actuales.map((fila) => [fila.email, fila]));

	const nuevos: string[] = [];
	let existentes = 0;
	let reactivados = 0;
	let compartidos = 0;

	await db.transaction(async (tx) => {
		for (const email of normalizados) {
			const actual = porEmail.get(email);
			if (!actual) {
				nuevos.push(email);
				continue;
			}
			if (!actual.activo) {
				await tx
					.update(serviciosEmails)
					.set({ activo: true, uso, actualizadoEn: new Date() })
					.where(eq(serviciosEmails.id, actual.id));
				reactivados++;
				continue;
			}
			const destino = combinarUso(actual.uso, uso);
			if (destino === actual.uso) {
				existentes++;
				continue;
			}
			await tx
				.update(serviciosEmails)
				.set({ uso: destino, actualizadoEn: new Date() })
				.where(eq(serviciosEmails.id, actual.id));
			if (destino === 'COMPARTIDO') compartidos++;
		}

		if (nuevos.length > 0) {
			await tx.insert(serviciosEmails).values(nuevos.map((email) => ({ servicioId, email, uso })));
		}

		if (nuevos.length + reactivados + compartidos > 0) {
			await tx.insert(auditoriaCobranza).values({
				servicioId,
				accion: 'EMAILS_AGREGADOS',
				detalle: { uso, nuevos, reactivados, compartidos },
				usuario
			});
		}
	});

	return {
		agregados: nuevos.length + reactivados,
		existentes,
		reactivados,
		compartidos,
		emails: normalizados
	};
}

/** Cambia el destino de un mail (compartido, solo facturación o solo cobranza). */
export async function cambiarUsoEmail(
	id: number,
	uso: UsoEmail,
	usuario?: string
): Promise<EmailServicioListado> {
	if (!esUsoEmail(uso)) throw new Error('Destino de email inválido');
	const [actual] = await db
		.select({ ...columnas, servicioId: serviciosEmails.servicioId })
		.from(serviciosEmails)
		.where(eq(serviciosEmails.id, id));
	if (!actual) throw new Error('El email no existe');
	if (actual.uso === uso) return { id: actual.id, email: actual.email, uso: actual.uso, activo: actual.activo };

	await db.transaction(async (tx) => {
		await tx
			.update(serviciosEmails)
			.set({ uso, actualizadoEn: new Date() })
			.where(eq(serviciosEmails.id, id));
		await tx.insert(auditoriaCobranza).values({
			servicioId: actual.servicioId,
			accion: 'EMAIL_USO_CAMBIADO',
			detalle: { email: actual.email, anterior: actual.uso, nuevo: uso },
			usuario
		});
	});

	return { id: actual.id, email: actual.email, uso, activo: actual.activo };
}

export interface ResultadoBajaEmail {
	eliminado: boolean;
	/** Destino que conserva el mail, o `null` si quedó dado de baja. */
	uso: UsoEmail | null;
	email: string;
}

/**
 * Quita un mail de un listado.
 *
 * Si era compartido, no se borra: se lo deja en el otro listado y se avisa,
 * porque sigue recibiendo el proceso restante. Solo se da de baja cuando no
 * le queda ningún destino.
 */
export async function quitarEmailDeLista(
	id: number,
	lista: ListaEmail,
	usuario?: string
): Promise<ResultadoBajaEmail> {
	if (lista !== 'FACTURACION' && lista !== 'COBRANZA') throw new Error('Listado inválido');
	const [actual] = await db
		.select({ ...columnas, servicioId: serviciosEmails.servicioId })
		.from(serviciosEmails)
		.where(eq(serviciosEmails.id, id));
	if (!actual || !actual.activo) throw new Error('El email no existe');

	if (actual.uso === lista) {
		await db.transaction(async (tx) => {
			await tx
				.update(serviciosEmails)
				.set({ activo: false, actualizadoEn: new Date() })
				.where(eq(serviciosEmails.id, id));
			await tx.insert(auditoriaCobranza).values({
				servicioId: actual.servicioId,
				accion: 'EMAIL_QUITADO',
				detalle: { email: actual.email, uso: actual.uso },
				usuario
			});
		});
		return { eliminado: true, uso: null, email: actual.email };
	}

	if (actual.uso === 'COMPARTIDO') {
		const restante: UsoEmail = lista === 'COBRANZA' ? 'FACTURACION' : 'COBRANZA';
		await db.transaction(async (tx) => {
			await tx
				.update(serviciosEmails)
				.set({ uso: restante, actualizadoEn: new Date() })
				.where(eq(serviciosEmails.id, id));
			await tx.insert(auditoriaCobranza).values({
				servicioId: actual.servicioId,
				accion: 'EMAIL_USO_CAMBIADO',
				detalle: { email: actual.email, anterior: 'COMPARTIDO', nuevo: restante, motivo: `quita de ${lista}` },
				usuario
			});
		});
		return { eliminado: false, uso: restante, email: actual.email };
	}

	// Ya no pertenecía a ese listado: nada que hacer.
	return { eliminado: false, uso: actual.uso, email: actual.email };
}

/** Baja lógica completa: deja de recibir facturas y estados de cuenta. */
export async function eliminarEmailServicio(id: number, usuario?: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [actual] = await tx
			.select({ ...columnas, servicioId: serviciosEmails.servicioId })
			.from(serviciosEmails)
			.where(eq(serviciosEmails.id, id));
		if (!actual) return false;
		await tx
			.update(serviciosEmails)
			.set({ activo: false, actualizadoEn: new Date() })
			.where(eq(serviciosEmails.id, id));
		await tx.insert(auditoriaCobranza).values({
			servicioId: actual.servicioId,
			accion: 'EMAIL_QUITADO',
			detalle: { email: actual.email, uso: actual.uso, completo: true },
			usuario
		});
		return true;
	});
}

/**
 * Unifica los listados: todos los mails activos pasan a COMPARTIDO.
 *
 * Es una operación masiva, no un modo persistido. No se pierden direcciones,
 * pero sí la clasificación anterior, por eso la UI confirma antes.
 */
export async function unificarEmailsServicio(
	servicioId: number,
	usuario?: string
): Promise<{ actualizados: number }> {
	return db.transaction(async (tx) => {
		const actualizados = await tx
			.update(serviciosEmails)
			.set({ uso: 'COMPARTIDO', actualizadoEn: new Date() })
			.where(
				and(
					eq(serviciosEmails.servicioId, servicioId),
					eq(serviciosEmails.activo, true),
					ne(serviciosEmails.uso, 'COMPARTIDO')
				)
			)
			.returning({ id: serviciosEmails.id });

		if (actualizados.length > 0) {
			await tx.insert(auditoriaCobranza).values({
				servicioId,
				accion: 'EMAILS_UNIFICADOS',
				detalle: { actualizados: actualizados.length },
				usuario
			});
		}
		return { actualizados: actualizados.length };
	});
}

export interface FilaPlanillaEmails {
	servicioId: number;
	servicio: string;
	/** Mails activos de cobranza separados por `;`, listos para la planilla. */
	emails: string;
}

/**
 * Datos de la planilla de mails: todos los servicios vivos con sus mails de
 * cobranza activos (COMPARTIDO + COBRANZA). Los solo-facturación no se listan
 * porque la planilla reemplaza únicamente el listado de cobranza.
 */
export async function listarPlanillaEmails(): Promise<FilaPlanillaEmails[]> {
	const filas = await db
		.select({
			servicioId: servicios.id,
			servicio: servicios.contactoFacturacion,
			email: serviciosEmails.email
		})
		.from(servicios)
		.leftJoin(
			serviciosEmails,
			and(
				eq(serviciosEmails.servicioId, servicios.id),
				eq(serviciosEmails.activo, true),
				inArray(serviciosEmails.uso, usosDeLista('COBRANZA'))
			)
		)
		.where(isNull(servicios.eliminadoEn))
		.orderBy(asc(servicios.contactoFacturacion), asc(serviciosEmails.email));

	const porServicio = new Map<number, FilaPlanillaEmails>();
	for (const fila of filas) {
		const actual = porServicio.get(fila.servicioId) ?? {
			servicioId: fila.servicioId,
			servicio: fila.servicio,
			emails: ''
		};
		if (fila.email) actual.emails = actual.emails ? `${actual.emails}; ${fila.email}` : fila.email;
		porServicio.set(fila.servicioId, actual);
	}
	return [...porServicio.values()];
}

export interface FilaImportacionEmails {
	servicioId: number;
	/** Celda cruda de la planilla: vacía, `-` o mails separados por `;`. */
	emails: string;
}

export interface CambioServicioEmails extends CambiosEmails {
	servicioId: number;
	servicio: string;
	accion: 'SIN_CAMBIOS' | 'LIMPIAR' | 'REEMPLAZAR';
}

export interface ResumenImportacionEmails {
	/** `null` en la previsualización o cuando no hubo cambios. */
	importacionId: number | null;
	aplicar: boolean;
	filas: number;
	servicios: number;
	agregados: number;
	reactivados: number;
	compartidos: number;
	quitados: number;
	retenidos: number;
	sinCambios: number;
	detalle: CambioServicioEmails[];
}

export class ErrorImportacionEmails extends Error {
	constructor(public readonly errores: { fila: number; mensaje: string }[]) {
		super('La planilla de mails tiene errores');
		this.name = 'ErrorImportacionEmails';
	}
}

/**
 * Importa la planilla de mails de cobranza.
 *
 * - Celda vacía: el servicio no se toca.
 * - Celda `-`: se retiran todos sus mails de cobranza.
 * - Mails: reemplazan el listado de cobranza; los que faltan se dan de baja
 *   lógica (nunca se borran) y los solo-facturación que se retiran quedan en
 *   FACTURACION.
 *
 * Con `aplicar: false` solo valida y devuelve el diff para la previsualización.
 * La escritura es una única transacción, así una fila inválida no importa nada.
 */
export async function importarPlanillaEmails(datos: {
	filas: FilaImportacionEmails[];
	archivo?: string | null;
	usuario?: string;
	aplicar?: boolean;
}): Promise<ResumenImportacionEmails> {
	const aplicar = datos.aplicar === true;
	const errores: { fila: number; mensaje: string }[] = [];
	const vistos = new Set<number>();

	if (!Array.isArray(datos.filas) || datos.filas.length === 0) {
		throw new ErrorImportacionEmails([{ fila: 0, mensaje: 'La planilla no tiene filas' }]);
	}

	const filas: {
		fila: number;
		servicioId: number;
		accion: 'SIN_CAMBIOS' | 'LIMPIAR' | 'REEMPLAZAR';
		emails: string[];
	}[] = [];

	for (const [indice, fila] of datos.filas.entries()) {
		const numeroFila = indice + 2; // la fila 1 es el encabezado
		const servicioId = Number(fila?.servicioId);
		if (!Number.isInteger(servicioId) || servicioId <= 0) {
			errores.push({ fila: numeroFila, mensaje: 'ID de servicio inválido' });
			continue;
		}
		if (vistos.has(servicioId)) {
			errores.push({ fila: numeroFila, mensaje: `El servicio ${servicioId} está repetido en la planilla` });
			continue;
		}
		vistos.add(servicioId);

		const celda = leerCeldaEmails(fila?.emails);
		if (celda.invalidos.length > 0) {
			errores.push({ fila: numeroFila, mensaje: `Mail inválido: ${celda.invalidos.join(', ')}` });
		}
		filas.push({ fila: numeroFila, servicioId, accion: celda.accion, emails: celda.emails });
	}

	if (errores.length > 0) throw new ErrorImportacionEmails(errores);

	const ids = [...vistos];
	const serviciosDb = await db
		.select({ id: servicios.id, servicio: servicios.contactoFacturacion })
		.from(servicios)
		.where(and(inArray(servicios.id, ids), isNull(servicios.eliminadoEn)));
	const nombreServicio = new Map(serviciosDb.map((servicio) => [servicio.id, servicio.servicio]));
	for (const fila of filas) {
		if (!nombreServicio.has(fila.servicioId)) {
			errores.push({ fila: fila.fila, mensaje: `Servicio no encontrado: ID ${fila.servicioId}` });
		}
	}
	if (errores.length > 0) throw new ErrorImportacionEmails(errores);

	const mailsDb = await db
		.select({
			id: serviciosEmails.id,
			servicioId: serviciosEmails.servicioId,
			email: serviciosEmails.email,
			uso: serviciosEmails.uso,
			activo: serviciosEmails.activo
		})
		.from(serviciosEmails)
		.where(inArray(serviciosEmails.servicioId, ids));
	const mailsPorServicio = new Map<number, EmailActual[]>();
	for (const mail of mailsDb) {
		const lista = mailsPorServicio.get(mail.servicioId) ?? [];
		lista.push(mail);
		mailsPorServicio.set(mail.servicioId, lista);
	}

	const cambios: CambioServicioEmails[] = [];
	let agregados = 0;
	let reactivados = 0;
	let compartidos = 0;
	let quitados = 0;
	let retenidos = 0;
	let sinCambios = 0;

	for (const fila of filas) {
		if (fila.accion === 'SIN_CAMBIOS') continue;
		const actuales = mailsPorServicio.get(fila.servicioId) ?? [];
		const diff = diferenciarEmails(actuales, fila.accion === 'LIMPIAR' ? [] : fila.emails);
		if (!hayCambios(diff)) continue;

		agregados += diff.nuevos.length;
		reactivados += diff.reactivados.length;
		compartidos += diff.aCompartido.length;
		quitados += diff.quitados.length;
		retenidos += diff.retenidos.length;
		sinCambios += diff.sinCambios.length;
		cambios.push({
			servicioId: fila.servicioId,
			servicio: nombreServicio.get(fila.servicioId)!,
			accion: fila.accion,
			...diff
		});
	}

	const resumen = {
		filas: datos.filas.length,
		servicios: cambios.length,
		agregados,
		reactivados,
		compartidos,
		quitados,
		retenidos,
		sinCambios
	};

	if (!aplicar) {
		return { importacionId: null, aplicar: false, ...resumen, detalle: cambios };
	}
	if (cambios.length === 0) {
		return { importacionId: null, aplicar: true, ...resumen, detalle: [] };
	}

	const importacionId = await db.transaction(async (tx) => {
		const [cabecera] = await tx
			.insert(importacionesEmails)
			.values({
				archivo: datos.archivo ?? null,
				usuario: datos.usuario ?? null,
				totales: resumen
			})
			.returning({ id: importacionesEmails.id });

		const ahora = new Date();
		const motivo = `Importación de planilla${datos.archivo ? ` ${datos.archivo}` : ''}`;

		for (const cambio of cambios) {
			const actuales = mailsPorServicio.get(cambio.servicioId) ?? [];
			const porEmail = new Map(actuales.map((mail) => [mail.email.toLowerCase(), mail]));

			if (cambio.nuevos.length > 0) {
				await tx.insert(serviciosEmails).values(
					cambio.nuevos.map((email) => ({
						servicioId: cambio.servicioId,
						email,
						uso: 'COBRANZA' as const
					}))
				);
			}

			for (const email of cambio.reactivados) {
				const actual = porEmail.get(email);
				if (!actual) continue;
				await tx
					.update(serviciosEmails)
					.set({
						activo: true,
						uso: 'COBRANZA',
						bajaEn: null,
						bajaPor: null,
						bajaMotivo: null,
						actualizadoEn: ahora
					})
					.where(eq(serviciosEmails.id, actual.id));
			}

			for (const email of cambio.aCompartido) {
				const actual = porEmail.get(email);
				if (!actual) continue;
				await tx
					.update(serviciosEmails)
					.set({ uso: 'COMPARTIDO', actualizadoEn: ahora })
					.where(eq(serviciosEmails.id, actual.id));
			}

			for (const email of cambio.quitados) {
				const actual = porEmail.get(email);
				if (!actual) continue;
				await tx
					.update(serviciosEmails)
					.set({
						activo: false,
						bajaEn: ahora,
						bajaPor: datos.usuario ?? null,
						bajaMotivo: motivo,
						actualizadoEn: ahora
					})
					.where(eq(serviciosEmails.id, actual.id));
			}

			for (const email of cambio.retenidos) {
				const actual = porEmail.get(email);
				if (!actual) continue;
				await tx
					.update(serviciosEmails)
					.set({ uso: 'FACTURACION', actualizadoEn: ahora })
					.where(eq(serviciosEmails.id, actual.id));
			}

			await tx.insert(auditoriaCobranza).values({
				servicioId: cambio.servicioId,
				accion: 'EMAILS_IMPORTADOS',
				detalle: {
					importacionId: cabecera.id,
					archivo: datos.archivo ?? null,
					accion: cambio.accion,
					nuevos: cambio.nuevos,
					reactivados: cambio.reactivados,
					aCompartido: cambio.aCompartido,
					quitados: cambio.quitados,
					retenidos: cambio.retenidos,
					sinCambios: cambio.sinCambios
				},
				usuario: datos.usuario ?? null
			});
		}

		return cabecera.id;
	});

	return { importacionId, aplicar: true, ...resumen, detalle: cambios };
}

/** Últimas importaciones de la planilla de mails, para el historial. */
export async function listarImportacionesEmails(limite = 20) {
	return db
		.select({
			id: importacionesEmails.id,
			archivo: importacionesEmails.archivo,
			usuario: importacionesEmails.usuario,
			totales: importacionesEmails.totales,
			creadoEn: importacionesEmails.creadoEn
		})
		.from(importacionesEmails)
		.orderBy(desc(importacionesEmails.creadoEn))
		.limit(limite);
}
