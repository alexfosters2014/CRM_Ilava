/**
 * Capa: ServiciosDatosAPI (usuarios y áreas)
 *
 * Único punto del frontend que habla con los endpoints de administración de
 * usuarios. Las pantallas no llaman a `fetch` directamente.
 */

export interface UsuarioAdmin {
	id: string;
	nombre: string;
	correo: string;
	rol: 'ADMIN' | 'OPERADOR';
	activo: boolean;
	area: { id: number; nombre: string } | null;
	eliminadoEn: string | null;
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

export interface GrupoPermisos {
	clave: string;
	etiqueta: string;
	orden: number;
	hojas: { clave: string; etiqueta: string }[];
}

export interface DatosUsuario {
	nombre: string;
	correo: string;
	rol: 'ADMIN' | 'OPERADOR';
	areaId: number | null;
	pantallas: string[];
}

export interface DatosUsuarioParcial {
	nombre?: string;
	correo?: string;
	rol?: 'ADMIN' | 'OPERADOR';
	areaId?: number | null;
	pantallas?: string[];
}

export async function leerError(res: Response, respaldo: string): Promise<string> {
	const datos = await res.json().catch(() => ({}));
	const detalle =
		Array.isArray(datos?.detalles) && datos.detalles.length > 0
			? ` (${datos.detalles[0].campo}: ${datos.detalles[0].mensaje})`
			: '';
	return `${datos?.error ?? respaldo}${detalle}`;
}

export async function listarUsuarios(incluirInactivos = false): Promise<UsuarioAdmin[]> {
	const res = await fetch(`/api/usuarios${incluirInactivos ? '?incluirInactivos=1' : ''}`, {
		cache: 'no-store'
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudieron cargar los usuarios'));
	return res.json();
}

export async function crearUsuario(datos: DatosUsuario): Promise<{ id: string; reactivado: boolean }> {
	const res = await fetch('/api/usuarios', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear el usuario'));
	return res.json();
}

export async function actualizarUsuario(id: string, datos: DatosUsuarioParcial): Promise<void> {
	const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el usuario'));
}

export async function darDeBajaUsuario(id: string, motivo?: string): Promise<void> {
	const query = motivo ? `?motivo=${encodeURIComponent(motivo)}` : '';
	const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}${query}`, {
		method: 'DELETE'
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo dar de baja el usuario'));
}

export async function restaurarUsuario(id: string): Promise<void> {
	const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}/restaurar`, { method: 'POST' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo restaurar el usuario'));
}

export async function listarAreas(): Promise<AreaAdmin[]> {
	const res = await fetch('/api/areas', { cache: 'no-store' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudieron cargar las áreas'));
	return res.json();
}

export async function crearArea(nombre: string): Promise<{ id: number }> {
	const res = await fetch('/api/areas', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ nombre })
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo crear el área'));
	return res.json();
}

export async function actualizarArea(
	id: number,
	datos: { nombre?: string; activo?: boolean }
): Promise<void> {
	const res = await fetch(`/api/areas/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(datos)
	});
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar el área'));
}

export async function darDeBajaArea(id: number): Promise<void> {
	const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo dar de baja el área'));
}

export async function restaurarArea(id: number): Promise<void> {
	const res = await fetch(`/api/areas/${id}/restaurar`, { method: 'POST' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo restaurar el área'));
}

export async function listarCatalogoPermisos(): Promise<GrupoPermisos[]> {
	const res = await fetch('/api/permisos/catalogo', { cache: 'no-store' });
	if (!res.ok) throw new Error(await leerError(res, 'No se pudo cargar el catálogo de permisos'));
	const cuerpo = (await res.json()) as { pantallas: GrupoPermisos[] };
	return cuerpo.pantallas ?? [];
}
