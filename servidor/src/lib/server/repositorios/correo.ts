import { and, asc, eq, ne } from 'drizzle-orm';
import { createTransport } from 'nodemailer';
import { cuentasCorreo, cuentasCorreoAlias, db } from '../base-datos/index.ts';
import { cifrarCredencial, descifrarCredencial } from '../autenticacion/cifrado.ts';
import { clasificarErrorCorreo, type ErrorCorreoClasificado } from '../servicios/correo-errores.ts';

/**
 * Repositorio: cuentas de correo.
 *
 * Administra las cuentas SMTP y sus alias. La contraseña se guarda cifrada y
 * NUNCA se devuelve al cliente: la API expone solo `tieneClave`.
 */

export interface AliasCorreo {
	id: number;
	email: string;
	nombreVisible: string | null;
	activo: boolean;
}

export interface CuentaCorreoListado {
	id: number;
	nombre: string;
	email: string;
	host: string;
	puerto: number;
	seguro: boolean;
	usuario: string;
	activo: boolean;
	predeterminada: boolean;
	tieneClave: boolean;
	credencialEstado: 'SIN_VERIFICAR' | 'OK' | 'RECHAZADA';
	credencialError: string | null;
	credencialVerificadaEn: string | null;
	alias: AliasCorreo[];
}

export interface DatosCuentaCorreo {
	id?: number;
	nombre: string;
	email: string;
	host: string;
	puerto?: number;
	seguro?: boolean;
	usuario: string;
	clave?: string;
	activo?: boolean;
	predeterminada?: boolean;
	alias?: { id?: number; email: string; nombreVisible?: string | null; activo?: boolean }[];
	usuarioApp?: string;
}

function transporte(cuenta: { host: string; puerto: number; seguro: boolean; usuario: string; clave: string }) {
	return createTransport({
		host: cuenta.host,
		port: cuenta.puerto,
		secure: cuenta.seguro,
		auth: { user: cuenta.usuario, pass: cuenta.clave },
		connectionTimeout: 15_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000
	});
}

function normalizarEmail(valor: string): string {
	return valor.trim().toLowerCase();
}

export async function listarCuentasCorreo(): Promise<CuentaCorreoListado[]> {
	const cuentas = await db.select().from(cuentasCorreo).orderBy(asc(cuentasCorreo.nombre));
	const alias = await db.select().from(cuentasCorreoAlias).orderBy(asc(cuentasCorreoAlias.email));
	return cuentas.map((cuenta) => ({
		id: cuenta.id,
		nombre: cuenta.nombre,
		email: cuenta.email,
		host: cuenta.host,
		puerto: cuenta.puerto,
		seguro: cuenta.seguro,
		usuario: cuenta.usuario,
		activo: cuenta.activo,
		predeterminada: cuenta.predeterminada,
		tieneClave: Boolean(cuenta.claveCifrada),
		credencialEstado: cuenta.credencialEstado as CuentaCorreoListado['credencialEstado'],
		credencialError: cuenta.credencialError,
		credencialVerificadaEn: cuenta.credencialVerificadaEn
			? cuenta.credencialVerificadaEn.toISOString()
			: null,
		alias: alias
			.filter((item) => item.cuentaId === cuenta.id)
			.map((item) => ({ id: item.id, email: item.email, nombreVisible: item.nombreVisible, activo: item.activo }))
	}));
}

export async function guardarCuentaCorreo(datos: DatosCuentaCorreo): Promise<CuentaCorreoListado> {
	const nombre = datos.nombre?.trim();
	const email = normalizarEmail(datos.email ?? '');
	const host = datos.host?.trim();
	const usuario = datos.usuario?.trim();
	if (!nombre || !email || !host || !usuario) {
		throw new Error('Nombre, email, servidor y usuario son obligatorios');
	}
	if (!datos.id && !datos.clave?.trim()) {
		throw new Error('La contraseña SMTP es obligatoria al crear la cuenta');
	}

	const puerto = datos.puerto ?? 587;
	const claveNueva = datos.clave?.trim();
	const valores = {
		nombre,
		email,
		host,
		puerto,
		seguro: Boolean(datos.seguro ?? puerto === 465),
		usuario,
		activo: datos.activo ?? true,
		predeterminada: Boolean(datos.predeterminada),
		...(claveNueva
			? { credencialEstado: 'SIN_VERIFICAR', credencialError: null, credencialVerificadaEn: null }
			: {}),
		actualizadoEn: new Date()
	};

	const cuenta = await db.transaction(async (tx) => {
		let fila;
		if (datos.id) {
			[fila] = await tx
				.update(cuentasCorreo)
				.set(claveNueva ? { ...valores, claveCifrada: cifrarCredencial(claveNueva) } : valores)
				.where(eq(cuentasCorreo.id, datos.id))
				.returning();
			if (!fila) throw new Error('La cuenta no existe');
		} else {
			if (!claveNueva) throw new Error('La contraseña SMTP es obligatoria al crear la cuenta');
			[fila] = await tx
				.insert(cuentasCorreo)
				.values({ ...valores, claveCifrada: cifrarCredencial(claveNueva), creadoPor: datos.usuarioApp })
				.returning();
		}

		// Solo una cuenta puede quedar como predeterminada.
		if (fila.predeterminada) {
			await tx
				.update(cuentasCorreo)
				.set({ predeterminada: false })
				.where(and(ne(cuentasCorreo.id, fila.id), eq(cuentasCorreo.predeterminada, true)));
		}

		if (datos.alias) {
			const actuales = await tx.select().from(cuentasCorreoAlias).where(eq(cuentasCorreoAlias.cuentaId, fila.id));
			const deseados = datos.alias
				.map((item) => ({ email: normalizarEmail(item.email), nombreVisible: item.nombreVisible?.trim() || null, activo: item.activo ?? true }))
				.filter((item) => item.email);
			for (const existente of actuales) {
				if (!deseados.some((item) => item.email === existente.email)) {
					await tx.delete(cuentasCorreoAlias).where(eq(cuentasCorreoAlias.id, existente.id));
				}
			}
			for (const item of deseados) {
				const encontrado = actuales.find((existente) => existente.email === item.email);
				if (encontrado) {
					await tx.update(cuentasCorreoAlias).set(item).where(eq(cuentasCorreoAlias.id, encontrado.id));
				} else {
					await tx.insert(cuentasCorreoAlias).values({ ...item, cuentaId: fila.id });
				}
			}
		}

		return fila;
	});

	return (await listarCuentasCorreo()).find((item) => item.id === cuenta.id)!;
}

export async function eliminarCuentaCorreo(id: number): Promise<boolean> {
	const [fila] = await db.delete(cuentasCorreo).where(eq(cuentasCorreo.id, id)).returning({ id: cuentasCorreo.id });
	return Boolean(fila);
}

/** Arma el remitente: alias si se eligió, si no el email de la cuenta. */
async function resolverRemitente(cuentaId: number, aliasId?: number | null) {
	const [cuenta] = await db.select().from(cuentasCorreo).where(eq(cuentasCorreo.id, cuentaId));
	if (!cuenta) throw new Error('La cuenta de correo no existe');
	if (!cuenta.activo) throw new Error('La cuenta de correo está deshabilitada');

	let email = cuenta.email;
	let nombre = cuenta.nombre;
	if (aliasId) {
		const [alias] = await db.select().from(cuentasCorreoAlias).where(eq(cuentasCorreoAlias.id, aliasId));
		if (!alias || alias.cuentaId !== cuenta.id) throw new Error('El alias no pertenece a la cuenta');
		if (!alias.activo) throw new Error('El alias está deshabilitado');
		email = alias.email;
		nombre = alias.nombreVisible?.trim() || cuenta.nombre;
	}
	return { cuenta, email, nombre };
}

export interface PruebaCorreo {
	destino: string;
	cuentaId?: number;
	aliasId?: number | null;
}

export interface EnvioConCuenta {
	cuentaId: number;
	aliasId?: number | null;
	para: string[];
	asunto: string;
	texto: string;
	html?: string;
	cc?: string[];
	bcc?: string[];
	adjuntos?: { filename: string; content: Buffer; contentType: string }[];
}

export class ErrorEnvioCorreo extends Error {
	constructor(public readonly clasificacion: ErrorCorreoClasificado) {
		super(clasificacion.explicacion);
		this.name = 'ErrorEnvioCorreo';
	}
}

type EstadoCredencial = 'SIN_VERIFICAR' | 'OK' | 'RECHAZADA';

/** Guarda el estado de la credencial sin romper el envío si falla la escritura. */
async function marcarCredencial(cuentaId: number, estado: EstadoCredencial, error: string | null) {
	try {
		await db
			.update(cuentasCorreo)
			.set({
				credencialEstado: estado,
				credencialError: error,
				credencialVerificadaEn: estado === 'SIN_VERIFICAR' ? null : new Date()
			})
			.where(eq(cuentasCorreo.id, cuentaId));
	} catch (e) {
		console.error('[correo] no se pudo guardar el estado de la credencial:', (e as Error).message);
	}
}

/**
 * Verifica conexión y autenticación SMTP sin enviar un correo.
 *
 * Es la forma barata de detectar una contraseña cambiada o revocada: si el
 * proveedor rechaza el login, marca la cuenta como RECHAZADA.
 */
export async function verificarCuentaCorreo(
	cuentaId: number
): Promise<{ ok: true } | { ok: false; clasificacion: ErrorCorreoClasificado }> {
	const [cuenta] = await db.select().from(cuentasCorreo).where(eq(cuentasCorreo.id, cuentaId));
	if (!cuenta) throw new Error('La cuenta de correo no existe');
	if (!cuenta.activo) throw new Error('La cuenta de correo está deshabilitada');
	const transporteEnvio = transporte({
		...cuenta,
		clave: descifrarCredencial(cuenta.claveCifrada)
	});
	try {
		await transporteEnvio.verify();
		await marcarCredencial(cuentaId, 'OK', null);
		return { ok: true };
	} catch (error) {
		const clasificacion = clasificarErrorCorreo(error);
		if (clasificacion.tipo === 'AUTENTICACION') {
			await marcarCredencial(cuentaId, 'RECHAZADA', clasificacion.mensaje);
		}
		return { ok: false, clasificacion };
	} finally {
		transporteEnvio.close();
	}
}

/**
 * Envía un correo usando una cuenta guardada (con su clave descifrada).
 * Devuelve el `messageId` del proveedor. Si falla, lanza `ErrorEnvioCorreo`
 * con la clasificación SMTP y actualiza el estado de la credencial.
 */
export async function enviarConCuenta(datos: EnvioConCuenta): Promise<string> {
	if (!datos.para.length) throw new Error('No hay destinatarios para el envío');
	const { cuenta, email, nombre } = await resolverRemitente(datos.cuentaId, datos.aliasId);
	const transporteEnvio = transporte({ ...cuenta, clave: descifrarCredencial(cuenta.claveCifrada) });
	try {
		const info = await transporteEnvio.sendMail({
			// (los destinatarios efectivos se registran abajo, incluidos CC/CCO)
			from: `"${nombre}" <${email}>`,
			to: datos.para.join(', '),
			...(datos.cc?.length ? { cc: datos.cc.join(', ') } : {}),
			...(datos.bcc?.length ? { bcc: datos.bcc.join(', ') } : {}),
			...(datos.adjuntos?.length ? { attachments: datos.adjuntos } : {}),
			subject: datos.asunto,
			text: datos.texto,
			html: datos.html ?? datos.texto
		});
		const aceptados = Array.isArray(info.accepted) ? info.accepted.length : 0;
		const rechazados = Array.isArray(info.rejected) ? info.rejected.length : 0;
		console.info(
			`[correo] enviado · aceptados: ${aceptados} · rechazados: ${rechazados} (id: ${info.messageId})`
		);
		await marcarCredencial(datos.cuentaId, 'OK', null);
		return info.messageId;
	} catch (error) {
		const clasificacion = clasificarErrorCorreo(error);
		if (clasificacion.tipo === 'AUTENTICACION') {
			await marcarCredencial(datos.cuentaId, 'RECHAZADA', clasificacion.mensaje);
		}
		throw new ErrorEnvioCorreo(clasificacion);
	} finally {
		transporteEnvio.close();
	}
}

/** Envía un correo de prueba y devuelve el error SMTP real si falla. */
export async function probarCuentaCorreo(datos: PruebaCorreo): Promise<{ ok: true; messageId: string }> {
	const destino = normalizarEmail(datos.destino ?? '');
	if (!destino.includes('@')) throw new Error('Indicá un correo de destino válido');
	if (!datos.cuentaId) throw new Error('Elegí una cuenta guardada para probar');
	const messageId = await enviarConCuenta({
		cuentaId: datos.cuentaId,
		aliasId: datos.aliasId,
		para: [destino],
		asunto: 'Prueba de envío — CRM',
		texto: 'Si recibiste este mensaje, la cuenta SMTP está configurada correctamente.',
		html: '<p>Si recibiste este mensaje, la cuenta SMTP está configurada correctamente.</p>'
	});
	return { ok: true, messageId };
}
