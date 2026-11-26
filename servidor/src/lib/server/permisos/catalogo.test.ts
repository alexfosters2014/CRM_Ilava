import { describe, expect, it } from 'vitest';
import {
	CLAVES,
	CLAVES_HOJA,
	HOJAS,
	PANTALLAS,
	clavesDeApi,
	hojasDe,
	validarCatalogo
} from './catalogo.ts';

/**
 * Integridad del catálogo de permisos.
 *
 * Estos tests son la red que evita que una pantalla nueva quede sin llave o
 * que un endpoint quede accesible por el padre equivocado.
 */
describe('catálogo de permisos', () => {
	it('no tiene errores estructurales', () => {
		expect(validarCatalogo()).toEqual([]);
	});

	it('no repite claves', () => {
		expect(new Set(CLAVES).size).toBe(CLAVES.length);
	});

	it('toda pantalla de primer nivel tiene ruta', () => {
		for (const pantalla of PANTALLAS) {
			expect(pantalla.ruta, `la pantalla ${pantalla.clave} no tiene ruta`).toBeTruthy();
		}
	});

	it('toda clave es hoja o tiene hijos', () => {
		for (const clave of CLAVES) {
			const hojas = hojasDe(clave);
			expect(hojas.length, `la clave ${clave} no representa ninguna hoja`).toBeGreaterThan(0);
			for (const hoja of hojas) {
				expect(CLAVES_HOJA.has(hoja), `${hoja} no es una hoja declarada`).toBe(true);
			}
		}
	});

	it('las hojas son las únicas asignables', () => {
		expect(HOJAS.length).toBeGreaterThan(0);
		for (const hoja of HOJAS) {
			expect(CLAVES.includes(hoja.clave)).toBe(true);
		}
	});

	it('Configuración agrupa sus siete opciones', () => {
		expect(hojasDe('configuracion').sort()).toEqual(
			[
				'configuracion.apariencia',
				'configuracion.catalogos',
				'configuracion.correo',
				'configuracion.facturacion',
				'configuracion.grupos',
				'configuracion.usuarios',
				'configuracion.whatsapp'
			].sort()
		);
	});

	describe('resolución de API', () => {
		it('resuelve una ruta simple', () => {
			expect([...clavesDeApi('/api/servicios')]).toEqual(['servicios']);
			expect([...clavesDeApi('/api/servicios/12')]).toEqual(['servicios']);
		});

		it('los endpoints compartidos aceptan cualquiera de sus pantallas', () => {
			const catalogos = clavesDeApi('/api/catalogos');
			expect(catalogos.has('servicios')).toBe(true);
			expect(catalogos.has('multifacturador')).toBe(true);
			// Cobranza usa los catálogos para la planilla de servicios faltantes.
			expect(catalogos.has('cobranza')).toBe(true);

			const emails = clavesDeApi('/api/emails');
			expect(emails.has('servicios')).toBe(true);
			expect(emails.has('cobranza')).toBe(true);

			const correo = clavesDeApi('/api/correo/cuentas');
			expect(correo.has('configuracion.correo')).toBe(true);
			// Administrar credenciales SMTP NO es parte de Cobranza.
			expect(correo.has('cobranza')).toBe(false);

			// Cobranza lee los remitentes por su propio endpoint de solo lectura.
			expect([...clavesDeApi('/api/cobranza/cuentas')]).toEqual(['cobranza']);
		});

		it('el agregado de Configuración no concede sus opciones', () => {
			// Exacto: solo el padre.
			expect([...clavesDeApi('/api/configuracion')]).toEqual(['configuracion']);
			// Un hijo concede solo el hijo, nunca el padre ni los hermanos.
			expect([...clavesDeApi('/api/configuracion/catalogos')]).toEqual([
				'configuracion.catalogos'
			]);
			expect([...clavesDeApi('/api/configuracion/apariencia')]).toEqual([
				'configuracion.apariencia'
			]);
		});

		it('los grupos de cobranza se comparten entre Configuración, Cobranza y Servicios', () => {
			const claves = clavesDeApi('/api/cobranza/grupos-cobranza');
			expect(claves.has('cobranza')).toBe(true);
			expect(claves.has('servicios')).toBe(true);
			expect(claves.has('configuracion.grupos')).toBe(true);
		});

		it('una ruta desconocida no resuelve ninguna llave (fail-closed)', () => {
			expect(clavesDeApi('/api/inventada').size).toBe(0);
			expect(clavesDeApi('/api/servicios-extra').size).toBe(0);
		});

		it('la configuración de cobranza pertenece a la pantalla Cobranza', () => {
			expect([...clavesDeApi('/api/configuracion/cobranza')]).toEqual(['cobranza']);
		});
	});
});
