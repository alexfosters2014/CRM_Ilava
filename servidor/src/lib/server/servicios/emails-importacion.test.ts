import { describe, expect, it } from 'vitest';
import {
	diferenciarEmails,
	hayCambios,
	leerCeldaEmails,
	type EmailActual
} from './emails-importacion.ts';

const actual = (
	email: string,
	uso: EmailActual['uso'],
	activo = true,
	id = 1
): EmailActual => ({ id, email, uso, activo });

describe('leerCeldaEmails', () => {
	it('una celda vacía no toca el servicio', () => {
		expect(leerCeldaEmails('')).toEqual({ accion: 'SIN_CAMBIOS', emails: [], invalidos: [] });
		expect(leerCeldaEmails('   ')).toEqual({ accion: 'SIN_CAMBIOS', emails: [], invalidos: [] });
		expect(leerCeldaEmails(null)).toEqual({ accion: 'SIN_CAMBIOS', emails: [], invalidos: [] });
	});

	it('un guion pide retirar todos los mails de cobranza', () => {
		expect(leerCeldaEmails('-')).toEqual({ accion: 'LIMPIAR', emails: [], invalidos: [] });
		expect(leerCeldaEmails(' - ')).toEqual({ accion: 'LIMPIAR', emails: [], invalidos: [] });
	});

	it('acepta punto y coma, coma y saltos de línea', () => {
		const celda = leerCeldaEmails('Luis@X.com; marta@y.com,\npedro@z.com');
		expect(celda.accion).toBe('REEMPLAZAR');
		expect(celda.emails).toEqual(['luis@x.com', 'marta@y.com', 'pedro@z.com']);
		expect(celda.invalidos).toEqual([]);
	});

	it('normaliza, quita repetidos y reporta inválidos', () => {
		const celda = leerCeldaEmails('A@B.com; a@b.com; roto; otro@ok.com');
		expect(celda.emails).toEqual(['a@b.com', 'roto', 'otro@ok.com']);
		expect(celda.invalidos).toEqual(['roto']);
	});
});

describe('diferenciarEmails', () => {
	it('detecta altas, reactivaciones y sin cambios', () => {
		const cambios = diferenciarEmails(
			[
				actual('vigente@x.com', 'COBRANZA', true, 1),
				actual('baja@x.com', 'COBRANZA', false, 2),
				actual('factura@x.com', 'FACTURACION', true, 3)
			],
			['vigente@x.com', 'baja@x.com', 'nuevo@x.com', 'factura@x.com']
		);
		expect(cambios.nuevos).toEqual(['nuevo@x.com']);
		expect(cambios.reactivados).toEqual(['baja@x.com']);
		expect(cambios.aCompartido).toEqual(['factura@x.com']);
		expect(cambios.sinCambios).toEqual(['vigente@x.com']);
		expect(hayCambios(cambios)).toBe(true);
	});

	it('da de baja los de cobranza que ya no están y retiene los compartidos', () => {
		const cambios = diferenciarEmails(
			[
				actual('cobranza@x.com', 'COBRANZA', true, 1),
				actual('compartido@x.com', 'COMPARTIDO', true, 2),
				actual('factura@x.com', 'FACTURACION', true, 3)
			],
			['otro@x.com']
		);
		expect(cambios.quitados).toEqual(['cobranza@x.com']);
		expect(cambios.retenidos).toEqual(['compartido@x.com']);
		expect(cambios.aCompartido).toEqual([]);
		expect(cambios.nuevos).toEqual(['otro@x.com']);
	});

	it('con la lista vacía retira todo lo que estaba en cobranza', () => {
		const cambios = diferenciarEmails(
			[
				actual('cobranza@x.com', 'COBRANZA', true, 1),
				actual('compartido@x.com', 'COMPARTIDO', true, 2),
				actual('factura@x.com', 'FACTURACION', true, 3)
			],
			[]
		);
		expect(cambios.quitados).toEqual(['cobranza@x.com']);
		expect(cambios.retenidos).toEqual(['compartido@x.com']);
		expect(hayCambios(cambios)).toBe(true);
	});

	it('normaliza la baja aunque el mail guardado tenga mayúsculas', () => {
		const cambios = diferenciarEmails(
			[actual('Viejo@X.com', 'COBRANZA', true, 1), actual('Compartido@X.com', 'COMPARTIDO', true, 2)],
			['nuevo@x.com']
		);
		expect(cambios.quitados).toEqual(['viejo@x.com']);
		expect(cambios.retenidos).toEqual(['compartido@x.com']);
	});

	it('reimportar el mismo listado no produce cambios', () => {
		const cambios = diferenciarEmails(
			[actual('a@x.com', 'COBRANZA', true, 1), actual('b@x.com', 'COMPARTIDO', true, 2)],
			['a@x.com', 'b@x.com']
		);
		expect(hayCambios(cambios)).toBe(false);
		expect(cambios.sinCambios.sort()).toEqual(['a@x.com', 'b@x.com']);
	});
});
