import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { propagarCookiesDeRespuesta } from '../../src/lib/server/propagar-cookies.ts';

/**
 * El guard consulta `get-session` del lado del servidor. Si Better Auth renueva
 * la sesión, devuelve un Set-Cookie nuevo que hay que reemitir al navegador o
 * la cookie vence a los 15 días fijos.
 */

function espiarCookies() {
	const guardadas: { nombre: string; valor: string; opciones: Record<string, unknown> }[] = [];
	const cookies = {
		set: (nombre: string, valor: string, opciones: Record<string, unknown>) => {
			guardadas.push({ nombre, valor, opciones });
		}
	} as unknown as Cookies;
	return { cookies, guardadas };
}

function respuestaCon(cabeceras: string[]): Response {
	const headers = new Headers();
	for (const cabecera of cabeceras) headers.append('set-cookie', cabecera);
	return new Response(null, { status: 200, headers });
}

describe('propagarCookiesDeRespuesta', () => {
	it('reenvía la cookie de sesión con maxAge, path y flags', () => {
		const { cookies, guardadas } = espiarCookies();
		const respuesta = respuestaCon([
			'better-auth.session_token=abc123; Max-Age=1296000; Path=/; HttpOnly; SameSite=Lax'
		]);

		propagarCookiesDeRespuesta(cookies, respuesta, new URL('http://127.0.0.1:4173/principal'));

		expect(guardadas).toHaveLength(1);
		expect(guardadas[0].nombre).toBe('better-auth.session_token');
		expect(guardadas[0].valor).toBe('abc123');
		expect(guardadas[0].opciones).toMatchObject({
			path: '/',
			maxAge: 1296000,
			httpOnly: true,
			sameSite: 'lax'
		});
	});

	it('no marca secure cuando la conexión es http', () => {
		const { cookies, guardadas } = espiarCookies();
		const respuesta = respuestaCon(['s=1; Max-Age=60; Path=/; Secure; HttpOnly']);

		propagarCookiesDeRespuesta(cookies, respuesta, new URL('http://127.0.0.1:4173/'));

		expect(guardadas[0].opciones.secure).toBeUndefined();
	});

	it('sí marca secure sobre https', () => {
		const { cookies, guardadas } = espiarCookies();
		const respuesta = respuestaCon(['s=1; Max-Age=60; Path=/; Secure']);

		propagarCookiesDeRespuesta(cookies, respuesta, new URL('https://crm.ejemplo.com/'));

		expect(guardadas[0].opciones.secure).toBe(true);
	});

	it('no hace nada si no hay Set-Cookie', () => {
		const { cookies, guardadas } = espiarCookies();

		propagarCookiesDeRespuesta(cookies, respuestaCon([]), new URL('http://127.0.0.1:4173/'));

		expect(guardadas).toHaveLength(0);
	});

	it('reenvía varias cookies sin pisarlas', () => {
		const { cookies, guardadas } = espiarCookies();
		const respuesta = respuestaCon([
			'a=1; Max-Age=10; Path=/',
			'b=2; Max-Age=20; Path=/'
		]);

		propagarCookiesDeRespuesta(cookies, respuesta, new URL('http://127.0.0.1:4173/'));

		expect(guardadas.map((c) => c.nombre)).toEqual(['a', 'b']);
	});
});
