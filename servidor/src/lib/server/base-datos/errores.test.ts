import { describe, expect, it } from 'vitest';
import { esViolacionUnica } from './errores.ts';

describe('esViolacionUnica', () => {
	it('reconoce una violación directa de PostgreSQL', () => {
		expect(esViolacionUnica({ code: '23505' })).toBe(true);
	});

	it('reconoce una violación envuelta por Drizzle', () => {
		expect(esViolacionUnica({ cause: { code: '23505' } })).toBe(true);
	});

	it('rechaza códigos distintos y valores inválidos', () => {
		expect(esViolacionUnica({ cause: { code: '23503' } })).toBe(false);
		expect(esViolacionUnica(null)).toBe(false);
	});
});
