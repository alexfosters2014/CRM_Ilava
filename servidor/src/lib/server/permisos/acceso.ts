import { eq } from 'drizzle-orm';
import { areas, db, permisosUsuario, user, type Rol } from '../base-datos/index.ts';
import { auth } from '../autenticacion/auth.ts';
import { CLAVES_HOJA, definicionDe } from './catalogo.ts';
import type { UsuarioSesion } from './reglas.ts';

/**
 * Capa: Permisos — resolución del acceso desde la base.
 *
 * La identidad sale SIEMPRE de la cookie de sesión de Better Auth. Nunca del
 * cuerpo de la petición: `usuarioDePeticion` es para firmar auditoría, no para
 * autorizar.
 *
 * Los permisos se leen de la base en cada request (no viajan en la cookie), así
 * que revocar una pantalla impacta en el siguiente clic, sin re-login.
 *
 * Las reglas puras viven en `reglas.ts`; acá solo se carga el usuario.
 */

/**
 * Resuelve el usuario de la petición. Devuelve null si no hay sesión, si el
 * usuario ya no existe o si está dado de baja (lógico o desactivado).
 */
export async function cargarUsuarioDeSesion(request: Request): Promise<UsuarioSesion | null> {
	let id: string | undefined;

	try {
		const sesion = await auth.api.getSession({ headers: request.headers });
		id = sesion?.user?.id;
	} catch {
		return null;
	}

	if (!id) return null;

	const filas = await db
		.select({
			id: user.id,
			nombre: user.name,
			email: user.email,
			rol: user.rol,
			activo: user.activo,
			eliminadoEn: user.eliminadoEn,
			areaId: areas.id,
			areaNombre: areas.nombre
		})
		.from(user)
		.leftJoin(areas, eq(user.areaId, areas.id))
		.where(eq(user.id, id))
		.limit(1);

	const fila = filas[0];
	if (!fila) return null;
	// Un usuario dado de baja no conserva acceso aunque su sesión siga viva.
	if (!fila.activo || fila.eliminadoEn) return null;

	const admin = fila.rol === 'ADMIN';

	const permisos = admin
		? [...CLAVES_HOJA]
		: (
				await db
					.select({ clave: permisosUsuario.clave })
					.from(permisosUsuario)
					.where(eq(permisosUsuario.usuarioId, fila.id))
			)
				.map((filaPermiso) => filaPermiso.clave)
				// Las claves que ya no existen en el catálogo se ignoran: si se
				// borró una pantalla, la fila vieja no debe romper nada. Las
				// `soloAdmin` tampoco se exponen a un operador aunque la fila
				// exista por un error manual en la base.
				.filter((clave) => CLAVES_HOJA.has(clave) && !definicionDe(clave)?.soloAdmin);

	return {
		id: fila.id,
		nombre: fila.nombre,
		email: fila.email,
		rol: (fila.rol === 'ADMIN' ? 'ADMIN' : 'OPERADOR') as Rol,
		areaId: fila.areaId,
		areaNombre: fila.areaNombre,
		permisos,
		admin
	};
}

export type { UsuarioSesion } from './reglas.ts';
export { opcionesVisibles, pantallasVisibles, puede, puedeAlguno } from './reglas.ts';
