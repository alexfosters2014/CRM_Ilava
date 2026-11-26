import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Smoke test de autorización, contra una API en ejecución.
 *
 * No envía correos: inserta las filas de verificación directamente. Crea un
 * usuario OPERADOR temporal con una sola pantalla y lo borra al final.
 *
 * Uso (con la API de desarrollo levantada):
 *   cd servidor
 *   node scripts/smoke-autorizacion.mjs
 *
 * Variables opcionales: SMOKE_BASE, DATABASE_URL, SMOKE_ADMIN.
 * Sale con código 1 si algún caso no da lo esperado.
 */

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8080';
// Better Auth valida el Origin contra TRUSTED_ORIGINS (el frontend), no contra
// el host de la API. Sin esta cabecera, /api/auth/* responde 403 por CSRF.
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
const OPERADOR = 'auditoria.operador@example.com';

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

function soloPares(cookies) {
	return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function entrar(email) {
	const otp = await crearOtp(email);
	const res = await pedir('/api/auth/sign-in/email-otp', {
		metodo: 'POST',
		cuerpo: { email, otp }
	});
	return { status: res.status, cookie: soloPares(res.cookies) };
}

// --- 1. Sin sesión -----------------------------------------------------------

for (const ruta of ['/api/salud', '/api/servicios', '/api/sesion', '/api/configuracion', '/api/correo/cuentas']) {
	const res = await pedir(ruta);
	anotar(`sin sesión ${ruta}`, ruta === '/api/salud' ? 200 : 401, res.status);
}

// --- 2. Alta por OTP de un correo desconocido --------------------------------

const usuariosAntes = await db.query('select count(*)::int as total from "user"');
const desconocido = await pedir('/api/auth/email-otp/send-verification-otp', {
	metodo: 'POST',
	cuerpo: { email: 'noexiste.auditoria@example.com', type: 'sign-in' }
});
anotar('OTP a correo desconocido responde neutro (sin enumeración)', 200, desconocido.status);

const usuariosDespues = await db.query('select count(*)::int as total from "user"');
anotar('la tabla user no creció', usuariosAntes.rows[0].total, usuariosDespues.rows[0].total);

// --- 3. Admin ----------------------------------------------------------------

const altaAdmin = await entrar(ADMIN);
anotar('login OTP del admin', 200, altaAdmin.status);

const sesionAdmin = await pedir('/api/sesion', { cookie: altaAdmin.cookie });
anotar('admin /api/sesion', 200, sesionAdmin.status);
anotar('admin tiene rol ADMIN', 'ADMIN', sesionAdmin.datos?.usuario?.rol);
anotar('admin tiene 6 pantallas', 6, sesionAdmin.datos?.pantallas?.length);

for (const ruta of [
	'/api/servicios',
	'/api/configuracion',
	'/api/correo/cuentas',
	'/api/catalogos',
	'/api/cobranza',
	'/api/facturas'
]) {
	const res = await pedir(ruta, { cookie: altaAdmin.cookie });
	anotar(`admin ${ruta}`, 200, res.status);
}

// --- 4. Operador de prueba ---------------------------------------------------

const idOperador = `auditoria-${Date.now()}`;
await db.query('delete from "user" where email = $1', [OPERADOR]);
await db.query(
	`insert into "user" (id, name, email, email_verified, rol, activo)
	 values ($1, $2, $3, true, 'OPERADOR', true)`,
	[idOperador, 'Operador Auditoría', OPERADOR]
);
await db.query('insert into permisos_usuario (usuario_id, clave) values ($1, $2)', [
	idOperador,
	'cobranza'
]);

const altaOperador = await entrar(OPERADOR);
anotar('login OTP del operador', 200, altaOperador.status);

const sesionOperador = await pedir('/api/sesion', { cookie: altaOperador.cookie });
anotar('operador /api/sesion', 200, sesionOperador.status);
anotar('operador tiene 1 pantalla', 1, sesionOperador.datos?.pantallas?.length);
anotar('operador ve Cobranza', 'cobranza', sesionOperador.datos?.pantallas?.[0]?.clave);

for (const [ruta, esperado] of [
	['/api/cobranza', 200],
	['/api/cobranza/cuentas', 200],
	['/api/catalogos', 200],
	['/api/servicios', 403],
	['/api/configuracion', 403],
	['/api/configuracion/catalogos/monedas', 403],
	['/api/correo/cuentas', 403],
	['/api/facturas', 403]
]) {
	const res = await pedir(ruta, { cookie: altaOperador.cookie });
	anotar(`operador ${ruta}`, esperado, res.status);
}

// --- 5. Usuario desactivado --------------------------------------------------

await db.query('update "user" set activo = false where id = $1', [idOperador]);
const sesionRevocada = await pedir('/api/sesion', { cookie: altaOperador.cookie });
anotar('operador desactivado pierde acceso con su sesión viva', 401, sesionRevocada.status);

const nuevoLogin = await entrar(OPERADOR);
anotar('operador desactivado no puede crear sesión nueva', 403, nuevoLogin.status);

// --- Limpieza ----------------------------------------------------------------

await db.query('delete from "user" where id = $1', [idOperador]);
await db.query('delete from verification where identifier like $1', ['sign-in-otp-%auditoria%']);
await db.query('delete from verification where identifier = $1', [`sign-in-otp-${ADMIN}`]);
await db.end();

const fallidos = resultados.filter((r) => !r.ok);
console.log(
	JSON.stringify({ total: resultados.length, ok: resultados.length - fallidos.length, fallidos }, null, 2)
);
process.exit(fallidos.length === 0 ? 0 : 1);
