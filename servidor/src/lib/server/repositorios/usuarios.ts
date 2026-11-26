import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { areas, db, esViolacionUnica, permisosUsuario, session, user } from '../base-datos/index.ts';
import { CLAVES_HOJA, definicionDe, hojasDe, PANTALLAS } from '../permisos/catalogo.ts';
import type { DatosArea, DatosUsuario, DatosUsuarioParcial } from '../validaciones/usuarios.ts';

/**
 * Repositorio: usuarios y áreas.
 *
 * Reglas que viven acá (no en la ruta):
 * - Solo se guardan hojas del catálogo, nunca claves desconocidas ni `soloAdmin`.
 * - Un OPERADOR necesita al menos una pantalla.
 * - No se puede dar de baja al último ADMIN activo ni a uno mismo.
 * - Un correo de un usuario dado de baja se reactiva con los datos nuevos.
 * - Un área con usuarios activos no se puede dar de baja.
 * - La baja es lógica y borra las sesiones del usuario.
 */

export type CodigoErrorUsuarios =
	| 'NO_ENCONTRADO'
	| 'EMAIL_DUPLICADO'
	| 'ULTIMO_ADMIN'
	| 'PROPIO_USUARIO'
	| 'PANTALLA_INVALIDA'
	| 'AREA_DUPLICADA'
	| 'AREA_CON_USUARIOS'
	| 'AREA_PROTEGIDA';

export class ErrorUsuarios extends Error {
	constructor(
		readonly codigo: CodigoErrorUsuarios,
		mensaje: string
	) {
		super(mensaje);
	}
}

/** Status HTTP sugerido para cada código de error de usuarios/áreas. */
export function estadoHttpUsuarios(codigo: CodigoErrorUsuarios): number {
	switch (codigo) {
		case 'NO_ENCONTRADO':
			return 404;
		case 'EMAIL_DUPLICADO':
		case 'ULTIMO_ADMIN':
		case 'AREA_DUPLICADA':
		case 'AREA_CON_USUARIOS':
		case 'AREA_PROTEGIDA':
			return 409;
		case 'PROPIO_USUARIO':
		case 'PANTALLA_INVALIDA':
			return 400;
	}
}

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UsuarioAdmin {
	id: string;
	nombre: string;
	correo: string;
	rol: 'ADMIN' | 'OPERADOR';
	activo: boolean;
	area: { id: number; nombre: string } | null;
	eliminadoEn: Date | null;
	eliminadoPor: string | null;
	eliminadoMotivo: string | null;
	pantallas: string[];
}

export interface AreaAdmin {
	id: number;
	nombre: string;
	protegida: boolean;
	activo: boolean;
	usuariosActivos: number;
}

/** Valida y normaliza las pantallas que llegan de la UI. */
function pantallasValidas(pantallas: string[], rol: 'ADMIN' | 'OPERADOR'): string[] {
	const limpias = [...new Set(pantallas.map((pantalla) => pantalla.trim()).filter(Boolean))];

	const invalidas = limpias.filter((clave) => {
		const definicion = definicionDe(clave);
		return !CLAVES_HOJA.has(clave) || !definicion || definicion.soloAdmin;
	});

	if (invalidas.length > 0) {
		throw new ErrorUsuarios('PANTALLA_INVALIDA', `Pantalla inválida: ${invalidas.join(', ')}`);
	}

	if (rol === 'OPERADOR' && limpias.length === 0) {
		throw new ErrorUsuarios('PANTALLA_INVALIDA', 'Un operador necesita al menos una pantalla');
	}

	return limpias;
}

async function reemplazarPermisos(
	tx: Transaccion,
	usuarioId: string,
	pantallas: string[],
	actor: string
): Promise<void> {
	await tx.delete(permisosUsuario).where(eq(permisosUsuario.usuarioId, usuarioId));

	if (pantallas.length > 0) {
		await tx.insert(permisosUsuario).values(
			pantallas.map((clave) => ({ usuarioId, clave, otorgadoPor: actor }))
		);
	}
}

async function contarAdminsActivos(tx: Transaccion): Promise<number> {
	const [fila] = await tx
		.select({ total: sql<number>`count(*)::int` })
		.from(user)
		.where(and(eq(user.rol, 'ADMIN'), eq(user.activo, true), isNull(user.eliminadoEn)));

	return fila?.total ?? 0;
}

async function asegurarNoEsUltimoAdmin(tx: Transaccion, usuarioId: string): Promise<void> {
	const [objetivo] = await tx
		.select({ rol: user.rol, activo: user.activo, eliminadoEn: user.eliminadoEn })
		.from(user)
		.where(eq(user.id, usuarioId))
		.limit(1);

	if (!objetivo) throw new ErrorUsuarios('NO_ENCONTRADO', 'El usuario no existe');

	const esAdminActivo =
		objetivo.rol === 'ADMIN' && objetivo.activo && objetivo.eliminadoEn === null;

	if (esAdminActivo && (await contarAdminsActivos(tx)) <= 1) {
		throw new ErrorUsuarios(
			'ULTIMO_ADMIN',
			'No podés dejar el sistema sin administradores activos'
		);
	}
}

// --- Usuarios ----------------------------------------------------------------

export async function listarUsuarios(incluirInactivos = false): Promise<UsuarioAdmin[]> {
	const filas = await db
		.select({
			id: user.id,
			nombre: user.name,
			correo: user.email,
			rol: user.rol,
			activo: user.activo,
			areaId: areas.id,
			areaNombre: areas.nombre,
			eliminadoEn: user.eliminadoEn,
			eliminadoPor: user.eliminadoPor,
			eliminadoMotivo: user.eliminadoMotivo
		})
		.from(user)
		.leftJoin(areas, eq(user.areaId, areas.id))
		.orderBy(asc(user.createdAt), asc(user.id));

	const permisos = await db
		.select({ usuarioId: permisosUsuario.usuarioId, clave: permisosUsuario.clave })
		.from(permisosUsuario);

	const porUsuario = new Map<string, string[]>();
	for (const permiso of permisos) {
		const lista = porUsuario.get(permiso.usuarioId) ?? [];
		lista.push(permiso.clave);
		porUsuario.set(permiso.usuarioId, lista);
	}

	return filas
		.filter((fila) => incluirInactivos || (fila.activo && fila.eliminadoEn === null))
		.map((fila) => ({
			id: fila.id,
			nombre: fila.nombre,
			correo: fila.correo,
			rol: (fila.rol === 'ADMIN' ? 'ADMIN' : 'OPERADOR') as 'ADMIN' | 'OPERADOR',
			activo: fila.activo && fila.eliminadoEn === null,
			area: fila.areaId ? { id: fila.areaId, nombre: fila.areaNombre ?? '' } : null,
			eliminadoEn: fila.eliminadoEn,
			eliminadoPor: fila.eliminadoPor,
			eliminadoMotivo: fila.eliminadoMotivo,
			// Un ADMIN tiene todo por definición; no dependemos de sus filas.
			pantallas:
				fila.rol === 'ADMIN'
					? PANTALLAS.flatMap((pantalla) => hojasDe(pantalla.clave)).filter(
							(clave) => !definicionDe(clave)?.soloAdmin
						)
					: (porUsuario.get(fila.id) ?? []).filter((clave) => CLAVES_HOJA.has(clave))
		}));
}

export async function crearUsuario(
	datos: DatosUsuario,
	actor: string
): Promise<{ id: string; reactivado: boolean }> {
	const pantallas = pantallasValidas(datos.pantallas, datos.rol);
	const correo = datos.correo.toLowerCase();

	return await db.transaction(async (tx) => {
		const [existente] = await tx
			.select({
				id: user.id,
				activo: user.activo,
				eliminadoEn: user.eliminadoEn
			})
			.from(user)
			.where(eq(user.email, correo))
			.limit(1);

		if (existente && existente.activo && existente.eliminadoEn === null) {
			throw new ErrorUsuarios('EMAIL_DUPLICADO', 'Ya existe un usuario activo con ese correo');
		}

		if (existente) {
			// Reactivación: se toman los datos nuevos (incluidas las pantallas).
			await tx
				.update(user)
				.set({
					name: datos.nombre,
					email: correo,
					emailVerified: true,
					rol: datos.rol,
					areaId: datos.areaId ?? null,
					activo: true,
					eliminadoEn: null,
					eliminadoPor: null,
					eliminadoMotivo: null,
					updatedAt: new Date()
				})
				.where(eq(user.id, existente.id));

			await reemplazarPermisos(tx, existente.id, pantallas, actor);
			return { id: existente.id, reactivado: true };
		}

		const id = randomUUID();
		await tx.insert(user).values({
			id,
			name: datos.nombre,
			email: correo,
			emailVerified: true,
			rol: datos.rol,
			areaId: datos.areaId ?? null,
			activo: true
		});

		await reemplazarPermisos(tx, id, pantallas, actor);
		return { id, reactivado: false };
	});
}

export async function actualizarUsuario(
	id: string,
	datos: DatosUsuarioParcial,
	actor: { id: string; email: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const [objetivo] = await tx
			.select({ id: user.id, rol: user.rol, activo: user.activo, eliminadoEn: user.eliminadoEn, correo: user.email })
			.from(user)
			.where(eq(user.id, id))
			.limit(1);

		if (!objetivo) throw new ErrorUsuarios('NO_ENCONTRADO', 'El usuario no existe');

		// OJO: se compara por ID, no por correo. `actor.email` es para auditoría.
		if (id === actor.id && datos.rol !== undefined && datos.rol !== objetivo.rol) {
			throw new ErrorUsuarios('PROPIO_USUARIO', 'No podés cambiarte el rol a vos mismo');
		}

		if (datos.correo && datos.correo !== objetivo.correo) {
			const [duplicado] = await tx
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.email, datos.correo), ne(user.id, id)))
				.limit(1);

			if (duplicado) {
				throw new ErrorUsuarios('EMAIL_DUPLICADO', 'Ya existe otro usuario con ese correo');
			}
		}

		if (datos.rol !== undefined && datos.rol !== 'ADMIN' && objetivo.rol === 'ADMIN') {
			await asegurarNoEsUltimoAdmin(tx, id);
		}

		const cambios: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
		if (datos.nombre !== undefined) cambios.name = datos.nombre;
		if (datos.correo !== undefined) cambios.email = datos.correo;
		if (datos.rol !== undefined) cambios.rol = datos.rol;
		if (datos.areaId !== undefined) cambios.areaId = datos.areaId ?? null;

		await tx.update(user).set(cambios).where(eq(user.id, id));

		if (datos.pantallas !== undefined) {
			const rolFinal = datos.rol ?? (objetivo.rol === 'ADMIN' ? 'ADMIN' : 'OPERADOR');
			await reemplazarPermisos(tx, id, pantallasValidas(datos.pantallas, rolFinal), actor.email);
		}
	});
}

export async function darDeBajaUsuario(
	id: string,
	actor: { id: string; email: string },
	motivo?: string
): Promise<void> {
	await db.transaction(async (tx) => {
		const [objetivo] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, id))
			.limit(1);

		if (!objetivo) throw new ErrorUsuarios('NO_ENCONTRADO', 'El usuario no existe');
		// OJO: se compara por ID, no por correo.
		if (id === actor.id) {
			throw new ErrorUsuarios('PROPIO_USUARIO', 'No podés darte de baja a vos mismo');
		}

		await asegurarNoEsUltimoAdmin(tx, id);

		await tx
			.update(user)
			.set({
				activo: false,
				eliminadoEn: new Date(),
				eliminadoPor: actor.email,
				eliminadoMotivo: motivo?.trim() || 'Baja desde administración',
				updatedAt: new Date()
			})
			.where(eq(user.id, id));

		// Las sesiones no sobreviven a la baja: Better Auth no valida flags de
		// negocio en getSession, así que se borran de forma explícita.
		await tx.delete(session).where(eq(session.userId, id));
	});
}

export async function restaurarUsuario(id: string): Promise<void> {
	const actualizado = await db
		.update(user)
		.set({
			activo: true,
			eliminadoEn: null,
			eliminadoPor: null,
			eliminadoMotivo: null,
			updatedAt: new Date()
		})
		.where(eq(user.id, id))
		.returning({ id: user.id });

	if (actualizado.length === 0) throw new ErrorUsuarios('NO_ENCONTRADO', 'El usuario no existe');
}

// --- Áreas -------------------------------------------------------------------

export async function listarAreas(): Promise<AreaAdmin[]> {
	const filas = await db
		.select({ id: areas.id, nombre: areas.nombre, protegida: areas.protegida, activo: areas.activo })
		.from(areas)
		.orderBy(asc(areas.id));

	const conteos = await db
		.select({ areaId: user.areaId, total: sql<number>`count(*)::int` })
		.from(user)
		.where(and(eq(user.activo, true), isNull(user.eliminadoEn), isNotNull(user.areaId)))
		.groupBy(user.areaId);

	const porArea = new Map(conteos.map((fila) => [fila.areaId, fila.total]));

	return filas.map((fila) => ({
		...fila,
		usuariosActivos: porArea.get(fila.id) ?? 0
	}));
}

export async function crearArea(nombre: string): Promise<{ id: number }> {
	try {
		const [creada] = await db
			.insert(areas)
			.values({ nombre: nombre.trim() })
			.returning({ id: areas.id });
		return { id: creada.id };
	} catch (error) {
		if (esViolacionUnica(error)) {
			throw new ErrorUsuarios('AREA_DUPLICADA', 'Ya existe un área con ese nombre');
		}
		throw error;
	}
}

async function cargarArea(id: number) {
	const [area] = await db.select().from(areas).where(eq(areas.id, id)).limit(1);
	if (!area) throw new ErrorUsuarios('NO_ENCONTRADO', 'El área no existe');
	return area;
}

export async function actualizarArea(
	id: number,
	datos: Partial<DatosArea> & { activo?: boolean },
	actor: string
): Promise<void> {
	const area = await cargarArea(id);

	if (area.protegida && (datos.nombre !== undefined || datos.activo === false)) {
		throw new ErrorUsuarios('AREA_PROTEGIDA', 'El área TODOS no se puede renombrar ni dar de baja');
	}

	if (datos.nombre !== undefined && datos.nombre !== area.nombre) {
		const [duplicada] = await db
			.select({ id: areas.id })
			.from(areas)
			.where(and(eq(areas.nombre, datos.nombre.trim()), ne(areas.id, id)))
			.limit(1);
		if (duplicada) throw new ErrorUsuarios('AREA_DUPLICADA', 'Ya existe un área con ese nombre');
	}

	if (datos.activo === false) {
		await asegurarAreaSinUsuarios(id);
	}

	const cambios: Partial<typeof areas.$inferInsert> = { actualizadoEn: new Date() };
	if (datos.nombre !== undefined) cambios.nombre = datos.nombre.trim();

	if (datos.activo === false) {
		cambios.activo = false;
		cambios.eliminadoEn = new Date();
		cambios.eliminadoPor = actor;
		cambios.eliminadoMotivo = 'Baja desde administración';
	} else if (datos.activo === true) {
		cambios.activo = true;
		cambios.eliminadoEn = null;
		cambios.eliminadoPor = null;
		cambios.eliminadoMotivo = null;
	}

	await db.update(areas).set(cambios).where(eq(areas.id, id));
}

async function asegurarAreaSinUsuarios(id: number): Promise<void> {
	const [conteo] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(user)
		.where(and(eq(user.areaId, id), eq(user.activo, true), isNull(user.eliminadoEn)));

	if ((conteo?.total ?? 0) > 0) {
		throw new ErrorUsuarios(
			'AREA_CON_USUARIOS',
			`El área tiene ${conteo.total} usuario(s) activo(s). Reasignalos antes de darla de baja.`
		);
	}
}

export async function darDeBajaArea(id: number, actor: string): Promise<void> {
	await actualizarArea(id, { activo: false }, actor);
}

export async function restaurarArea(id: number): Promise<void> {
	await cargarArea(id);
	await db
		.update(areas)
		.set({
			activo: true,
			eliminadoEn: null,
			eliminadoPor: null,
			eliminadoMotivo: null,
			actualizadoEn: new Date()
		})
		.where(eq(areas.id, id));
}

// --- Catálogo de permisos ----------------------------------------------------

export interface GrupoPermisos {
	clave: string;
	etiqueta: string;
	orden: number;
	hojas: { clave: string; etiqueta: string }[];
}

/**
 * Pantallas y opciones otorgables. Excluye las `soloAdmin`: esas no se pueden
 * dar a un operador ni aunque alguien las pida por API.
 */
export function catalogoPermisos(): GrupoPermisos[] {
	return PANTALLAS.filter((pantalla) => !pantalla.soloAdmin).map((pantalla) => ({
		clave: pantalla.clave,
		etiqueta: pantalla.etiqueta,
		orden: pantalla.orden,
		hojas: hojasDe(pantalla.clave)
			.map((clave) => definicionDe(clave))
			.filter((definicion) => definicion && !definicion.soloAdmin)
			.map((definicion) => ({ clave: definicion!.clave, etiqueta: definicion!.etiqueta }))
	}));
}
