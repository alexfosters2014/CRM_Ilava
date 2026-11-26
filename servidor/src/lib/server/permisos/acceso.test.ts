import { describe, expect, it } from 'vitest';
import type { UsuarioSesion } from './reglas.ts';
import { puede, puedeAlguno, opcionesVisibles, pantallasVisibles } from './reglas.ts';
import { clavesDeApi } from './catalogo.ts';

/**
 * Reglas de decisión de acceso (sin base de datos).
 *
 * La matriz completa contra la API se agrega cuando exista el arnés de
 * integración; estas pruebas cubren la lógica que decide el 403.
 */

function usuario(parcial: Partial<UsuarioSesion> = {}): UsuarioSesion {
	return {
		id: 'u1',
		nombre: 'Prueba',
		email: 'prueba@vector.com.uy',
		rol: 'OPERADOR',
		areaId: null,
		areaNombre: null,
		permisos: [],
		admin: false,
		...parcial
	};
}

describe('decisión de acceso', () => {
	it('el administrador accede a todo', () => {
		const admin = usuario({ rol: 'ADMIN', admin: true });
		expect(puede(admin, 'cobranza')).toBe(true);
		expect(puede(admin, 'configuracion')).toBe(true);
		expect(puede(admin, 'configuracion.correo')).toBe(true);
	});

	it('un operador solo accede a lo otorgado', () => {
		const operador = usuario({ permisos: ['cobranza'] });
		expect(puede(operador, 'cobranza')).toBe(true);
		expect(puede(operador, 'servicios')).toBe(false);
		expect(puede(operador, 'multifacturador')).toBe(false);
	});

	it('una opción de Configuración no concede a sus hermanas ni al padre completo', () => {
		const operador = usuario({ permisos: ['configuracion.catalogos'] });
		// La pantalla Configuración se ve porque al menos una opción está habilitada.
		expect(puede(operador, 'configuracion')).toBe(true);
		expect(puede(operador, 'configuracion.catalogos')).toBe(true);
		expect(puede(operador, 'configuracion.apariencia')).toBe(false);
		expect(puede(operador, 'configuracion.correo')).toBe(false);
	});

	it('una clave desconocida nunca autoriza', () => {
		const operador = usuario({ permisos: ['pantalla.que.ya.no.existe'] });
		expect(puede(operador, 'pantalla.que.ya.no.existe')).toBe(false);
		expect(puede(operador, 'inventada')).toBe(false);
	});

	it('un endpoint compartido se acepta con cualquiera de sus llaves', () => {
		const clavesCatalogos = clavesDeApi('/api/catalogos');

		const deServicios = usuario({ permisos: ['servicios'] });
		const deFacturador = usuario({ permisos: ['multifacturador'] });
		const deCobranza = usuario({ permisos: ['cobranza'] });
		const sinAcceso = usuario({ permisos: ['clientes'] });

		expect(puedeAlguno(deServicios, clavesCatalogos)).toBe(true);
		expect(puedeAlguno(deFacturador, clavesCatalogos)).toBe(true);
		// Cobranza también los usa (planilla de servicios faltantes).
		expect(puedeAlguno(deCobranza, clavesCatalogos)).toBe(true);
		expect(puedeAlguno(sinAcceso, clavesCatalogos)).toBe(false);
	});

	it('el agregado de Configuración exige alguna opción, no otra pantalla', () => {
		const claves = clavesDeApi('/api/configuracion');
		expect(puedeAlguno(usuario({ permisos: ['cobranza'] }), claves)).toBe(false);
		expect(puedeAlguno(usuario({ permisos: ['configuracion.apariencia'] }), claves)).toBe(true);
	});

	it('el menú solo muestra pantallas habilitadas', () => {
		const operador = usuario({ permisos: ['cobranza'] });
		expect(pantallasVisibles(operador).map((p) => p.clave)).toEqual(['cobranza']);
	});

	it('las opciones visibles de Configuración respetan cada switch', () => {
		const operador = usuario({ permisos: ['configuracion.catalogos', 'configuracion.grupos'] });
		expect(opcionesVisibles(operador, 'configuracion').map((o) => o.clave)).toEqual([
			'configuracion.catalogos',
			'configuracion.grupos'
		]);
	});
});
