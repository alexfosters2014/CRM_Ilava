import { describe, expect, it } from 'vitest';
import {
	armarFilasCobranza,
	armarPdfCobranza,
	totalesDeFilas,
	type DocumentoCobranzaWhatsApp
} from './cobranza-whatsapp.ts';

const base: Omit<DocumentoCobranzaWhatsApp, 'tipoComprobante' | 'numero' | 'saldo' | 'importe'> = {
	serie: 'A',
	fechaEmision: '2026-08-31',
	fechaVencimiento: '2026-09-30',
	moneda: 'UYU',
	excluidoEnvio: false
};

function documento(
	cambios: Partial<DocumentoCobranzaWhatsApp> & {
		tipoComprobante: string;
		numero: string;
		saldo: string;
	}
): DocumentoCobranzaWhatsApp {
	return { ...base, importe: cambios.saldo, ...cambios };
}

describe('armarFilasCobranza', () => {
	it('incluye notas de crédito: el saldo negativo es parte del total', () => {
		const filas = armarFilasCobranza(
			[
				documento({ tipoComprobante: 'Venta Crédito', numero: '39496', saldo: '1200.00' }),
				documento({ tipoComprobante: 'Nota de Crédito', numero: '3389', saldo: '-207.52' })
			],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);

		expect(filas).toHaveLength(2);
		expect(filas[1].tipoComprobante).toBe('Nota de Crédito');
		expect(filas[1].saldo).toBe('-207.52');
		expect(filas.reduce((total, fila) => total + Number(fila.saldo), 0)).toBeCloseTo(992.48);
	});

	it('descarta saldos en cero y exclusiones temporales', () => {
		const filas = armarFilasCobranza(
			[
				documento({ tipoComprobante: 'Venta Crédito', numero: '1', saldo: '100' }),
				documento({ tipoComprobante: 'Venta Crédito', numero: '2', saldo: '0' }),
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: '3',
					saldo: '50',
					excluidoEnvio: true
				})
			],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);

		expect(filas.map((fila) => fila.numero)).toEqual(['1']);
	});

	it('solo vencidos usa el vencimiento efectivo', () => {
		const filas = armarFilasCobranza(
			[
				documento({ tipoComprobante: 'Venta Crédito', numero: 'vencida', saldo: '100' }),
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: 'futura',
					saldo: '100',
					fechaVencimiento: '2026-12-31'
				}),
				documento({
					tipoComprobante: 'Nota de Crédito',
					numero: 'credito-vencida',
					saldo: '-20'
				})
			],
			{ soloVencidos: true, hoy: '2026-11-23' }
		);

		expect(filas.map((fila) => fila.numero)).toEqual(['vencida', 'credito-vencida']);
	});

	it('los totales netean notas de crédito y separan monedas', () => {
		const filas = armarFilasCobranza(
			[
				documento({ tipoComprobante: 'Venta Crédito', numero: '1', saldo: '1200.00' }),
				documento({ tipoComprobante: 'Nota de Crédito', numero: '2', saldo: '-207.52' }),
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: '3',
					saldo: '100.50',
					moneda: 'USD'
				})
			],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);

		expect(totalesDeFilas(filas)).toEqual({ uyu: 992.48, usd: 100.5 });
	});

	it('solo vencidos usa el plazo del servicio, igual que el modal', () => {
		const filas = armarFilasCobranza(
			[
				// Emitida hace 84 días: vencida aunque la fecha explícita sea futura.
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: 'plazo-vencido',
					saldo: '100',
					fechaEmision: '2026-08-31',
					fechaVencimiento: '2026-12-31'
				}),
				// Emitida hace 3 días: no vencida aunque la fecha explícita sea vieja.
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: 'plazo-vigente',
					saldo: '100',
					fechaEmision: '2026-11-20',
					fechaVencimiento: '2026-10-01'
				})
			],
			{ soloVencidos: true, hoy: '2026-11-23', plazoDias: 30 }
		);

		expect(filas.map((fila) => fila.numero)).toEqual(['plazo-vencido']);
	});

	it('usa la carta y el fondo del modelo cuando están habilitados', () => {
		const filas = armarFilasCobranza(
			[documento({ tipoComprobante: 'Venta Crédito', numero: '1', saldo: '100' })],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);
		const { html, fondo } = armarPdfCobranza({
			contacto: 'EMPRESA EJEMPLO S.A.',
			periodo: '2026-11',
			filas,
			plantilla: {
				cartaHabilitada: true,
				cartaHtml: '<h1>{{nombre_servicio}}</h1>{{estado_cuenta_general}}',
				cartaFondo: 'data:image/png;base64,ABC'
			}
		});

		expect(fondo).toBe('data:image/png;base64,ABC');
		expect(html).toContain('EMPRESA EJEMPLO S.A.');
		expect(html).toContain('Venta Crédito');
	});

	it('sin carta usa la tabla simple, pero conserva el fondo', () => {
		const filas = armarFilasCobranza(
			[documento({ tipoComprobante: 'Venta Crédito', numero: '1', saldo: '100' })],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);
		const { html, fondo } = armarPdfCobranza({
			contacto: 'EMPRESA EJEMPLO S.A.',
			periodo: '2026-11',
			filas,
			plantilla: { cartaHabilitada: false, cartaHtml: null, cartaFondo: 'fondo.png' }
		});

		expect(fondo).toBe('fondo.png');
		expect(html).toContain('Estado de cuenta');
	});

	it('sin fecha de vencimiento aplica el plazo de 30 días', () => {
		const filas = armarFilasCobranza(
			[
				documento({
					tipoComprobante: 'Venta Crédito',
					numero: 'sin-fecha',
					saldo: '100',
					fechaVencimiento: null,
					fechaEmision: '2026-11-01'
				})
			],
			{ soloVencidos: false, hoy: '2026-11-23' }
		);

		expect(filas[0].vencimiento).toBe('2026-12-01');
	});
});
