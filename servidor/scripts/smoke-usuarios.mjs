import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Smoke test de administración de usuarios y áreas.
 *
 * Requiere la API de desarrollo levantada en 8080 y la migración 0033 aplicada.
 * No envía correos: inserta las filas de verificación directamente.
 *
 * Uso:
 *   cd servidor
 *   node scripts/smoke-usuarios.mjs
 */

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8080';
// Better Auth valida el Origin contra TRUSTED_ORIGINS (el frontend).
const ORIGEN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';
// Las credenciales viven en servidor/.env, nunca en el codigo. loadEnvFile no
// pisa las variables que ya vienen del entorno (SMOKE_* / DATABASE_URL).
try {
	process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
	// Sin .env: se usan los valores por defecto de desarrollo.
}
const DB = process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5433/crmdb';
// Cuenta admin existente en esa base; sobreescribir con SMOKE_ADMIN.
const ADMIN = process.env.SMOKE_ADMIN ?? 'admin@example.com';
const CORREO_OPERADOR = 'auditoria.usuario@example.com';
const CORREO_ADMIN2 = 'auditoria.admin@example.com';
const AREA_PRUEBA = 'Área Auditoría';

const db = new pg.Client({ connectionString: DB });
await db.connect();

const resultados = [];

async function pedir(ruta, { metodo = 'GET', cookie, cuerpo } = {}) {
	const headers = { origin: ORIGEN };
	if (cookie) headers.cookie = cookie;
	if (cuerpo !== undefined) headers['content-type'] = 'application/json';

	const res = await fetch(`${BASE}${ruta}`, {
		method: metodo,
		headers,
		body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
	});

	let datos = null;
	try {
		datos = await res.json();
	} catch {}

	return { status: res.status, datos, cookies: res.headers.getSetCookie?.() ?? [] };
}

function anotar(caso, esperado, obtenido) {
	resultados.push({ caso, esperado, obtenido, ok: esperado === obtenido });
}

function soloPares(cookies) {
	return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function crearOtp(email) {
	const otp = String(Math.floor(100000 + Math.random() * 900000));
	const ahora = new Date();
	await db.query('delete from verification where identifier = $1', [`sign-in-otp-${email}`]);
	await db.query(
		`insert into verification (id, identifier, value, expires_at, created_at, updated_at)
		 values ($1, $2, $3, $4, $5, $5)`,
		[randomUUID(), `sign-in-otp-${email}`, `${otp}:0`, new Date(ahora.getTime() + 5 * 60_000), ahora]
	);
	return otp;
}

async function entrar(email) {
	const otp = await crearOtp(email);
	const res = await pedir('/api/auth/sign-in/email-otp', { metodo: 'POST', cuerpo: { email, otp } });
	return { status: res.status, cookie: soloPares(res.cookies) };
}

async function limpiar() {
	await db.query('delete from "user" where email = any($1)', [[CORREO_OPERADOR, CORREO_ADMIN2]]);
	await db.query('delete from areas where nombre = $1', [AREA_PRUEBA]);
	await db.query('delete from verification where identifier like $1', ['sign-in-otp-%auditoria%']);
	await db.query('delete from verification where identifier = $1', [`sign-in-otp-${ADMIN}`]);
}

await limpiar();

const admin = await entrar(ADMIN);
anotar('login del admin', 200, admin.status);
if (admin.status !== 200) {
	console.error('No se pudo iniciar sesión como admin; se aborta el smoke.');
	await limpiar();
	await db.end();
	process.exit(1);
}

// --- Catálogo y listados -----------------------------------------------------

const catalogo = await pedir('/api/permisos/catalogo', { cookie: admin.cookie });
anotar('catálogo de permisos', 200, catalogo.status);
anotar('catálogo trae 6 pantallas', 6, catalogo.datos?.pantallas?.length);

const configuracion = catalogo.datos?.pantallas?.find((p) => p.clave === 'configuracion');
anotar('Configuración ofrece 5 opciones (sin Usuarios)', 5, configuracion?.hojas?.length);
anotar(
	'Usuarios no es otorgable',
	false,
	configuracion?.hojas?.some((h) => h.clave === 'configuracion.usuarios')
);

const areasIniciales = await pedir('/api/areas', { cookie: admin.cookie });
anotar('listar áreas', 200, areasIniciales.status);
anotar(
	'existe el área TODOS',
	true,
	Array.isArray(areasIniciales.datos) &&
		areasIniciales.datos.some((a) => a.nombre === 'TODOS' && a.protegida)
);

// --- Alta de operador --------------------------------------------------------

const areaTODOS = Array.isArray(areasIniciales.datos)
	? areasIniciales.datos.find((a) => a.nombre === 'TODOS')
	: null;

if (!areaTODOS) {
	console.error('No se encontró el área TODOS; se aborta el smoke.');
	await limpiar();
	await db.end();
	process.exit(1);
}

const alta = await pedir('/api/usuarios', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: {
		nombre: 'Usuario Auditoría',
		correo: CORREO_OPERADOR,
		rol: 'OPERADOR',
		areaId: areaTODOS.id,
		pantallas: ['cobranza', 'configuracion.catalogos']
	}
});
anotar('crear operador', 201, alta.status);

const duplicado = await pedir('/api/usuarios', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: {
		nombre: 'Duplicado',
		correo: CORREO_OPERADOR,
		rol: 'OPERADOR',
		areaId: areaTODOS.id,
		pantallas: ['cobranza']
	}
});
anotar('correo duplicado rechazado', 409, duplicado.status);

const sinPantallas = await pedir('/api/usuarios', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: {
		nombre: 'Sin pantallas',
		correo: 'auditoria.sinpantallas@example.com',
		rol: 'OPERADOR',
		areaId: null,
		pantallas: []
	}
});
anotar('operador sin pantallas rechazado', 400, sinPantallas.status);

const soloAdmin = await pedir('/api/usuarios', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: {
		nombre: 'Escalada',
		correo: 'auditoria.escalada@example.com',
		rol: 'OPERADOR',
		areaId: null,
		pantallas: ['configuracion.usuarios']
	}
});
anotar('no se puede otorgar configuracion.usuarios', 400, soloAdmin.status);

// --- Operador: matriz de acceso ---------------------------------------------

const operador = await entrar(CORREO_OPERADOR);
anotar('login del operador', 200, operador.status);

for (const [ruta, esperado] of [
	['/api/cobranza', 200],
	['/api/configuracion', 200],
	['/api/configuracion/apariencia', 403],
	['/api/servicios', 403],
	['/api/usuarios', 403],
	['/api/areas', 403],
	['/api/permisos/catalogo', 403]
]) {
	const res = await pedir(ruta, { cookie: operador.cookie });
	anotar(`operador ${ruta}`, esperado, res.status);
}

// --- Permisos vigentes sin re-login -----------------------------------------

const idOperador = alta.datos?.id;
const patch = await pedir(`/api/usuarios/${idOperador}`, {
	metodo: 'PATCH',
	cookie: admin.cookie,
	cuerpo: { pantallas: ['cobranza', 'servicios', 'configuracion.catalogos'] }
});
anotar('agregar pantalla al operador', 200, patch.status);

const serviciosAhora = await pedir('/api/servicios', { cookie: operador.cookie });
anotar('el operador accede a Servicios sin re-login', 200, serviciosAhora.status);

// --- Baja y restauración -----------------------------------------------------

const baja = await pedir(`/api/usuarios/${idOperador}`, { metodo: 'DELETE', cookie: admin.cookie });
anotar('dar de baja al operador', 200, baja.status);

const sesionMuerta = await pedir('/api/cobranza', { cookie: operador.cookie });
anotar('la sesión del operador dado de baja deja de servir', 401, sesionMuerta.status);

const loginBaja = await entrar(CORREO_OPERADOR);
anotar('el operador dado de baja no puede loguearse', 403, loginBaja.status);

const restaurar = await pedir(`/api/usuarios/${idOperador}/restaurar`, {
	metodo: 'POST',
	cookie: admin.cookie
});
anotar('restaurar al operador', 200, restaurar.status);

const loginRestaurado = await entrar(CORREO_OPERADOR);
anotar('el operador restaurado puede loguearse', 200, loginRestaurado.status);

// --- Guardas de auto-baja y último admin ------------------------------------

const yo = await pedir('/api/sesion', { cookie: admin.cookie });
const idAdmin = yo.datos?.usuario?.id;

const autobaja = await pedir(`/api/usuarios/${idAdmin}`, { metodo: 'DELETE', cookie: admin.cookie });
anotar('el admin no puede darse de baja a sí mismo', 400, autobaja.status);

const autorol = await pedir(`/api/usuarios/${idAdmin}`, {
	metodo: 'PATCH',
	cookie: admin.cookie,
	cuerpo: { rol: 'OPERADOR' }
});
anotar('el admin no puede cambiarse el rol a sí mismo', 400, autorol.status);

// --- Áreas -------------------------------------------------------------------

const areaNueva = await pedir('/api/areas', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: { nombre: AREA_PRUEBA }
});
anotar('crear área', 201, areaNueva.status);

const areaDuplicada = await pedir('/api/areas', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: { nombre: AREA_PRUEBA }
});
anotar('área duplicada rechazada', 409, areaDuplicada.status);

const renombrarTodos = await pedir(`/api/areas/${areaTODOS.id}`, {
	metodo: 'PATCH',
	cookie: admin.cookie,
	cuerpo: { nombre: 'OTRO' }
});
anotar('el área TODOS no se renombra', 409, renombrarTodos.status);

const moverOperador = await pedir(`/api/usuarios/${idOperador}`, {
	metodo: 'PATCH',
	cookie: admin.cookie,
	cuerpo: { areaId: areaNueva.datos?.id }
});
anotar('mover operador al área nueva', 200, moverOperador.status);

const bajaAreaConUsuarios = await pedir(`/api/areas/${areaNueva.datos?.id}`, {
	metodo: 'DELETE',
	cookie: admin.cookie
});
anotar('no se da de baja un área con usuarios activos', 409, bajaAreaConUsuarios.status);

await pedir(`/api/usuarios/${idOperador}`, {
	metodo: 'PATCH',
	cookie: admin.cookie,
	cuerpo: { areaId: areaTODOS.id }
});

const bajaArea = await pedir(`/api/areas/${areaNueva.datos?.id}`, {
	metodo: 'DELETE',
	cookie: admin.cookie
});
anotar('área sin usuarios se da de baja', 200, bajaArea.status);

const restaurarArea = await pedir(`/api/areas/${areaNueva.datos?.id}/restaurar`, {
	metodo: 'POST',
	cookie: admin.cookie
});
anotar('restaurar área', 200, restaurarArea.status);

// --- Segundo admin y baja entre admins --------------------------------------

const altaAdmin2 = await pedir('/api/usuarios', {
	metodo: 'POST',
	cookie: admin.cookie,
	cuerpo: {
		nombre: 'Admin Auditoría',
		correo: CORREO_ADMIN2,
		rol: 'ADMIN',
		areaId: areaTODOS.id,
		pantallas: []
	}
});
anotar('crear segundo admin', 201, altaAdmin2.status);

const bajaAdmin2 = await pedir(`/api/usuarios/${altaAdmin2.datos?.id}`, {
	metodo: 'DELETE',
	cookie: admin.cookie
});
anotar('un admin puede dar de baja a otro admin', 200, bajaAdmin2.status);

// --- Limpieza ----------------------------------------------------------------

await limpiar();
await db.end();

const fallidos = resultados.filter((r) => !r.ok);
console.log(
	JSON.stringify({ total: resultados.length, ok: resultados.length - fallidos.length, fallidos }, null, 2)
);
process.exit(fallidos.length === 0 ? 0 : 1);
