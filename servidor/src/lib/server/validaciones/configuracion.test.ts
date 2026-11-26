import { describe, expect, it } from 'vitest';
import { aparienciaSchema } from './configuracion.ts';

/**
 * Apariencia global: colores de fila, línea y espaciado de tablas y línea de
 * listas. Los rangos acotan lo que después se inyecta como CSS.
 */
const APARIENCIA = {
	filaParFondo: '#e2e9f7',
	filaParTexto: '#111827',
	filaImparFondo: '#ffffff',
	filaImparTexto: '#111827',
	tablaLineaColor: '#e3e8f4',
	tablaLineaGrosor: 1,
	filaPaddingY: 2,
	listaLineaColor: '#e3e8f4',
	listaLineaGrosor: 1
};

describe('aparienciaSchema', () => {
	it('acepta una apariencia completa y válida', () => {
		expect(aparienciaSchema.safeParse(APARIENCIA).success).toBe(true);
	});

	it('acepta los extremos de los rangos', () => {
		const extremos = {
			...APARIENCIA,
			tablaLineaGrosor: 0,
			filaPaddingY: 24,
			listaLineaGrosor: 4
		};
		expect(aparienciaSchema.safeParse(extremos).success).toBe(true);
	});

	it('rechaza colores que no son #RRGGBB', () => {
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, tablaLineaColor: 'red' }).success
		).toBe(false);
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, listaLineaColor: '#fff' }).success
		).toBe(false);
	});

	it('rechaza grosores fuera de rango o con decimales', () => {
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, tablaLineaGrosor: 5 }).success
		).toBe(false);
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, listaLineaGrosor: -1 }).success
		).toBe(false);
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, tablaLineaGrosor: 1.5 }).success
		).toBe(false);
	});

	it('rechaza un espaciado vertical fuera de rango', () => {
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, filaPaddingY: 25 }).success
		).toBe(false);
		expect(
			aparienciaSchema.safeParse({ ...APARIENCIA, filaPaddingY: -1 }).success
		).toBe(false);
	});
});
