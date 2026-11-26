import { describe, expect, it } from 'vitest';
import { nombreDesdeEmail } from './nombres.ts';

describe('nombre visible desde un correo', () => {
	it('separa el nombre y el apellido', () => {
		expect(nombreDesdeEmail('juan.perez@empresa.com')).toBe('Juan Perez');
	});

	it('quita la etiqueta de alias y los separadores', () => {
		expect(nombreDesdeEmail('j_perez+facturas@empresa.com')).toBe('J Perez');
	});

	it('capitaliza una casilla genérica', () => {
		expect(nombreDesdeEmail('cobranzas@empresa.com')).toBe('Cobranzas');
	});

	it('devuelve vacío si no hay correo', () => {
		expect(nombreDesdeEmail(null)).toBe('');
		expect(nombreDesdeEmail('  ')).toBe('');
	});
});
