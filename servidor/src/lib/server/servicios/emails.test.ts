import { describe, expect, it } from 'vitest';
import {
	combinarUso,
	emailsInvalidos,
	esUsoEmail,
	modoEmails,
	normalizarEmails,
	usosDeLista,
	type UsoEmail
} from './emails.ts';

describe('normalizarEmails', () => {
	it('recorta, pasa a minúsculas, descarta vacíos y deduplica', () => {
		expect(normalizarEmails([' Ana@X.com ', '', 'ana@x.com', 'LUIS@Y.COM'])).toEqual([
			'ana@x.com',
			'luis@y.com'
		]);
	});

	it('devuelve una lista vacía si no hay nada válido', () => {
		expect(normalizarEmails(['   '])).toEqual([]);
	});
});

describe('emailsInvalidos', () => {
	it('detecta formatos rotos', () => {
		expect(emailsInvalidos(['a@b.com', 'sin-arroba', 'a@b'])).toEqual(['sin-arroba', 'a@b']);
	});

	it('no marca como inválido un mail normal', () => {
		expect(emailsInvalidos(['facturacion@cliente.com.uy'])).toEqual([]);
	});
});

describe('combinarUso', () => {
	it('mantiene el destino cuando es el mismo', () => {
		expect(combinarUso('COBRANZA', 'COBRANZA')).toBe('COBRANZA');
		expect(combinarUso('FACTURACION', 'FACTURACION')).toBe('FACTURACION');
	});

	it('vuelve compartido al agregar un mail a la otra lista', () => {
		expect(combinarUso('COBRANZA', 'FACTURACION')).toBe('COMPARTIDO');
		expect(combinarUso('FACTURACION', 'COBRANZA')).toBe('COMPARTIDO');
	});

	it('un mail compartido nunca se degrada por agregarlo a una lista', () => {
		expect(combinarUso('COMPARTIDO', 'COBRANZA')).toBe('COMPARTIDO');
		expect(combinarUso('COMPARTIDO', 'FACTURACION')).toBe('COMPARTIDO');
	});
});

describe('usosDeLista', () => {
	it('cobranza lee compartidos y propios de cobranza', () => {
		expect(usosDeLista('COBRANZA')).toEqual(['COMPARTIDO', 'COBRANZA']);
	});

	it('facturación lee compartidos y propios de facturación', () => {
		expect(usosDeLista('FACTURACION')).toEqual(['COMPARTIDO', 'FACTURACION']);
	});
});

describe('modoEmails', () => {
	it('sin mails es vacío', () => {
		expect(modoEmails([])).toBe('VACIO');
	});

	it('todos compartidos es compartido', () => {
		expect(modoEmails(['COMPARTIDO', 'COMPARTIDO'])).toBe('COMPARTIDO');
	});

	it('ninguno compartido es separado', () => {
		expect(modoEmails(['FACTURACION', 'COBRANZA'])).toBe('SEPARADO');
	});

	it('compartidos y de un solo destino conviviendo es mixto', () => {
		expect(modoEmails(['COMPARTIDO', 'COBRANZA'])).toBe('MIXTO');
	});
});

describe('esUsoEmail', () => {
	it('acepta solo los tres destinos válidos', () => {
		expect(esUsoEmail('COMPARTIDO')).toBe(true);
		expect(esUsoEmail('COBRANZA')).toBe(true);
		expect(esUsoEmail('FACTURACION')).toBe(true);
		expect(esUsoEmail('OTRO')).toBe(false);
		expect(esUsoEmail(null)).toBe(false);
	});

	it('el tipo incluye los tres destinos', () => {
		const usos: UsoEmail[] = ['COMPARTIDO', 'FACTURACION', 'COBRANZA'];
		expect(usos).toHaveLength(3);
	});
});
