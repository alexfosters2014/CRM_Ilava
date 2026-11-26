import { describe, expect, it } from 'vitest';
import { eliminacionSchema } from './plantillas.ts';

/**
 * El borrado lógico trabaja por lotes: la validación es la frontera que evita
 * mandar ids inválidos o lotes desmedidos al repositorio.
 */
describe('eliminacionSchema', () => {
	it('acepta un lote de ids válidos', () => {
		const resultado = eliminacionSchema.safeParse({ ids: [1, 2, 3] });
		expect(resultado.success).toBe(true);
	});

	it('rechaza un lote vacío', () => {
		expect(eliminacionSchema.safeParse({ ids: [] }).success).toBe(false);
	});

	it('rechaza ids no enteros o no positivos', () => {
		expect(eliminacionSchema.safeParse({ ids: [0] }).success).toBe(false);
		expect(eliminacionSchema.safeParse({ ids: [1.5] }).success).toBe(false);
		expect(eliminacionSchema.safeParse({ ids: ['3'] }).success).toBe(false);
	});

	it('rechaza lotes de más de 500 plantillas', () => {
		const ids = Array.from({ length: 501 }, (_, i) => i + 1);
		expect(eliminacionSchema.safeParse({ ids }).success).toBe(false);
	});
});
