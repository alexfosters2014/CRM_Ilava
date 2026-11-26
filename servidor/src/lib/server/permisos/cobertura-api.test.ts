import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clavesDeApi, prefijosDeclarados } from './catalogo.ts';

/**
 * Cobertura de la API por el catálogo de permisos.
 *
 * Recorre las rutas reales de `src/routes/api`. Si mañana se agrega un endpoint
 * y nadie le asigna una llave, este test falla: es lo que impide que un
 * endpoint nuevo quede abierto (o cerrado de más) sin que nos enteremos.
 */

const RAIZ_API = fileURLToPath(new URL('../../../routes/api', import.meta.url));

/** Rutas que no requieren pantalla (públicas o solo-autenticado). */
const SIN_LLAVE = new Set([
	'/api/salud',
	'/api/docs',
	'/api/openapi.json',
	'/api/sesion',
	// Webhook externo: se autentica con x-ticket-secret, no con sesión.
	'/api/webhooks/tickets/[id]/correo',
	// Portal público del ticket: se autentica con el token del enlace.
	'/api/tickets/portal/[token]'
]);

function rutasDeApi(directorio: string, base = '/api'): string[] {
	const rutas: string[] = [];

	for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
		const ruta = `${base}/${entrada.name}`;
		if (entrada.isDirectory()) {
			rutas.push(...rutasDeApi(join(directorio, entrada.name), ruta));
		} else if (entrada.name === '+server.ts') {
			rutas.push(base);
		}
	}

	return rutas;
}

const RUTAS = rutasDeApi(RAIZ_API);

describe('cobertura de permisos de la API', () => {
	it('encuentra las rutas reales', () => {
		expect(RUTAS.length).toBeGreaterThan(50);
		expect(RUTAS).toContain('/api/servicios');
		expect(RUTAS).toContain('/api/servicios/[id]');
	});

	it('toda ruta tiene una llave o está en la lista blanca explícita', () => {
		const sinCobertura = RUTAS.filter(
			(ruta) => !SIN_LLAVE.has(ruta) && clavesDeApi(ruta).size === 0
		);

		expect(sinCobertura, `Rutas sin permiso asignado:\n- ${sinCobertura.join('\n- ')}`).toEqual([]);
	});

	it('la lista blanca es mínima y explícita', () => {
		expect([...SIN_LLAVE].sort()).toEqual(
			[
				'/api/docs',
				'/api/openapi.json',
				'/api/salud',
				'/api/sesion',
				'/api/webhooks/tickets/[id]/correo',
				'/api/tickets/portal/[token]'
			].sort()
		);
	});

	it('todo prefijo declarado corresponde a una ruta real', () => {
		const prefijosMuertos = prefijosDeclarados().filter((prefijo) => {
			if (prefijo === '/api') return false;
			return !RUTAS.some((ruta) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
		});

		expect(prefijosMuertos, `Prefijos sin ruta:\n- ${prefijosMuertos.join('\n- ')}`).toEqual([]);
	});

	it('las rutas sensibles resuelven a una pantalla concreta', () => {
		const esperado: Record<string, string[]> = {
			'/api/servicios': ['servicios'],
			'/api/clientes': ['clientes'],
			'/api/facturas': ['multifacturador'],
			'/api/plantillas': ['multifacturador'],
			'/api/cobranza': ['cobranza'],
			'/api/configuracion/apariencia': ['configuracion.apariencia'],
			'/api/configuracion/catalogos': ['configuracion.catalogos']
		};

		for (const [ruta, llaves] of Object.entries(esperado)) {
			expect([...clavesDeApi(ruta)].sort(), ruta).toEqual(llaves.sort());
		}
	});

	/**
	 * Foto completa de la matriz ruta → llaves. Cualquier cambio en el catálogo
	 * o una ruta nueva obliga a revisar este snapshot: es el registro de
	 * auditoría que se lee en el diff.
	 */
	it('mapa completo de rutas a llaves', () => {
		const mapa = Object.fromEntries(
			[...RUTAS]
				.sort()
				.map((ruta) => [
					ruta,
					SIN_LLAVE.has(ruta) ? ['<sin llave>'] : [...clavesDeApi(ruta)].sort()
				])
		);

		expect(mapa).toMatchSnapshot();
	});
});
