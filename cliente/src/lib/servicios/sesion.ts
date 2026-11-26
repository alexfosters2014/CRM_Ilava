/**
 * Capa: Servicios (frontend) — datos de sesión/usuario y accesos.
 *
 * Helpers puros para presentar el usuario autenticado y decidir qué mostrar.
 * La decisión de acceso real la toma la API: esto solo evita ofrecer botones
 * que van a terminar en 403.
 */

export interface Usuario {
	id?: string;
	name?: string | null;
	email?: string;
	image?: string | null;
	rol?: 'ADMIN' | 'OPERADOR';
	area?: { id: number; nombre: string } | null;
}

export interface PantallaVisible {
	clave: string;
	etiqueta: string;
	ruta: string | null;
	icono: string | null;
	orden: number;
}

export interface SesionApp {
	usuario: Usuario;
	admin: boolean;
	permisos: string[];
	pantallas: PantallaVisible[];
	rutas: { ruta: string; clave: string }[];
}

/** Nombre para mostrar: usa `name` si existe, si no deriva del correo. */
export function nombreVisible(usuario: Usuario | null | undefined): string {
	if (!usuario) return '';
	const nombre = (usuario.name ?? '').trim();
	if (nombre) return nombre;

	const correo = (usuario.email ?? '').trim();
	if (!correo) return 'Usuario';
	const local = correo.split('@')[0];
	return local
		.split(/[._\-+0-9]+/)
		.filter(Boolean)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(' ');
}

/** Iniciales para el avatar circular (1 o 2 letras). */
export function iniciales(usuario: Usuario | null | undefined): string {
	const nombre = nombreVisible(usuario);
	if (!nombre) return '?';
	const partes = nombre.split(/\s+/).filter(Boolean);
	if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
	return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

/** ¿La sesión tiene esta pantalla/opción habilitada? */
export function puedeVer(
	sesion: { admin: boolean; permisos: string[] } | null | undefined,
	clave: string
): boolean {
	if (!sesion) return false;
	if (sesion.admin) return true;
	return sesion.permisos.includes(clave);
}
