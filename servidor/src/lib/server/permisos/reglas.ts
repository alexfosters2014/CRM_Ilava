import { definicionDe, hijosDe, hojasDe, PANTALLAS, type PantallaDef } from './catalogo.ts';

/**
 * Capa: Permisos — reglas puras.
 *
 * Sin base de datos ni SvelteKit: solo decide, dado un usuario y una clave, si
 * puede pasar. Se testea sin levantar nada.
 */

export interface UsuarioSesion {
	id: string;
	nombre: string;
	email: string;
	rol: 'ADMIN' | 'OPERADOR';
	areaId: number | null;
	areaNombre: string | null;
	/** Hojas efectivas. Un ADMIN tiene todas. */
	permisos: string[];
	/** Atajo: un ADMIN nunca se evalúa contra la tabla. */
	admin: boolean;
}

/**
 * ¿El usuario puede acceder a esta pantalla/opción?
 *
 * Para un padre (p. ej. `configuracion`) alcanza con tener UNA de sus hojas.
 * Las claves desconocidas se rechazan siempre y las `soloAdmin` no se pueden
 * otorgar a un operador ni aunque la fila exista en la base.
 */
export function puede(usuario: UsuarioSesion, clave: string): boolean {
	const definicion = definicionDe(clave);
	if (!definicion) return false;
	if (definicion.soloAdmin) return usuario.admin;
	if (usuario.admin) return true;
	return hojasDe(clave).some((hoja) => usuario.permisos.includes(hoja));
}

/** ¿Puede acceder a alguna de las llaves? (endpoints compartidos) */
export function puedeAlguno(usuario: UsuarioSesion, claves: Iterable<string>): boolean {
	for (const clave of claves) {
		if (puede(usuario, clave)) return true;
	}
	return false;
}

/** Pantallas de primer nivel que el usuario puede ver, en orden. */
export function pantallasVisibles(usuario: UsuarioSesion): PantallaDef[] {
	return PANTALLAS.filter((pantalla) => !pantalla.soloAdmin && puede(usuario, pantalla.clave));
}

/** Opciones (pestañas) visibles de una pantalla padre. */
export function opcionesVisibles(usuario: UsuarioSesion, padre: string): PantallaDef[] {
	return hijosDe(padre).filter(
		(opcion) => (!opcion.soloAdmin || usuario.admin) && puede(usuario, opcion.clave)
	);
}
