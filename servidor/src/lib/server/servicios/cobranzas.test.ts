import { describe, expect, it } from 'vitest';
import {
	alertaMoraPorDias,
	calcularDiasAging,
	claveExclusionCobranza,
	diasDeudaMasAntigua,
	fechaCortePeriodo,
	fechaVencimientoEfectiva,
	normalizarTipoComprobante,
	plantillaListaComprobantes,
	estadoVencimiento,
	tramoDeudaMasAntigua,
	tramoPorDias,
	validarFilasCobranza,
	variablesDesconocidas
} from './cobranzas.ts';

describe('cobranza', () => {
	it('calcula el aging desde emisión', () => {
		expect(calcularDiasAging('2026-10-28', '2026-11-09')).toBe(12);
		expect(tramoPorDias(12)).toBe('1_30');
	});

	it('asume vencimiento a 30 días si falta', () => {
		expect(fechaVencimientoEfectiva('2026-10-28')).toBe('2026-11-27');
	});

	describe('estadoVencimiento', () => {
		it('vence recién cuando los días desde la emisión superan el plazo', () => {
			expect(estadoVencimiento(30, 30)).toEqual({ diasVencido: 0, vencida: false });
			expect(estadoVencimiento(31, 30)).toEqual({ diasVencido: 1, vencida: true });
			expect(estadoVencimiento(12, 30)).toEqual({ diasVencido: -18, vencida: false });
		});

		it('un plazo de 0 vence al día siguiente de la emisión', () => {
			expect(estadoVencimiento(0, 0).vencida).toBe(false);
			expect(estadoVencimiento(1, 0).vencida).toBe(true);
		});
	});

	describe('plantillaListaComprobantes', () => {
		const conVariable = 'Hola {{nombre_servicio}}, {{estado_cuenta_general}}';

		it('detecta el listado general en el cuerpo, sin importar mayúsculas ni espacios', () => {
			expect(plantillaListaComprobantes({ cuerpo: conVariable })).toBe(true);
			expect(plantillaListaComprobantes({ cuerpo: '{{  ESTADO_CUENTA_GENERAL  }}' })).toBe(true);
		});

		it('acepta las variantes por moneda', () => {
			expect(plantillaListaComprobantes({ cuerpo: '{{estado_cuenta_pesos}}' })).toBe(true);
			expect(plantillaListaComprobantes({ cuerpo: '{{estado_cuenta_dolares}}' })).toBe(true);
		});

		it('detecta el listado en la carta solo si la carta está habilitada', () => {
			expect(
				plantillaListaComprobantes({
					cuerpo: 'Sin tabla',
					cartaHabilitada: true,
					cartaHtml: '<p>{{estado_cuenta_general}}</p>'
				})
			).toBe(true);
			expect(
				plantillaListaComprobantes({
					cuerpo: 'Sin tabla',
					cartaHabilitada: false,
					cartaHtml: '<p>{{estado_cuenta_general}}</p>'
				})
			).toBe(false);
		});

		it('no confunde una plantilla sin listado', () => {
			expect(plantillaListaComprobantes({ cuerpo: 'Hola {{nombre_servicio}}, total {{total_pesos}}' })).toBe(false);
		});
	});

	describe('tramoDeudaMasAntigua', () => {
		it('usa el comprobante impago más viejo y es excluyente', () => {
			expect(
				tramoDeudaMasAntigua([
					{ diasAging: 150, saldoPendiente: '100.00' },
					{ diasAging: 10, saldoPendiente: '500.00' }
				])
			).toBe('MAS_90');
		});

		it('cae en 1–30 si solo debe facturas recientes', () => {
			expect(
				tramoDeudaMasAntigua([
					{ diasAging: 5, saldoPendiente: '100.00' },
					{ diasAging: 20, saldoPendiente: '50.00' }
				])
			).toBe('1_30');
		});

		it('ignora comprobantes saldados y notas de crédito', () => {
			expect(
				tramoDeudaMasAntigua([
					{ diasAging: 200, saldoPendiente: '0' },
					{ diasAging: 180, saldoPendiente: '-50.00' },
					{ diasAging: 45, saldoPendiente: '80.00' }
				])
			).toBe('31_60');
		});

		it('devuelve null cuando no hay deuda pendiente', () => {
			expect(tramoDeudaMasAntigua([])).toBeNull();
			expect(tramoDeudaMasAntigua([{ diasAging: 90, saldoPendiente: '0.00' }])).toBeNull();
		});

		it('marca A_VENCER cuando lo único pendiente no está vencido', () => {
			expect(tramoDeudaMasAntigua([{ diasAging: -5, saldoPendiente: '100.00' }])).toBe('A_VENCER');
		});
	});

	describe('alertaMoraPorDias', () => {
		it('no alerta sin deuda ni con deuda a vencer', () => {
			expect(alertaMoraPorDias(null)).toBeNull();
			expect(alertaMoraPorDias(0)).toBeNull();
			expect(alertaMoraPorDias(-12)).toBeNull();
		});

		it('usa mostaza entre 1 y 60 días (1-2 meses)', () => {
			expect(alertaMoraPorDias(1)).toBe('MOSTAZA');
			expect(alertaMoraPorDias(30)).toBe('MOSTAZA');
			expect(alertaMoraPorDias(60)).toBe('MOSTAZA');
		});

		it('usa naranja entre 61 y 150 días (3-5 meses)', () => {
			expect(alertaMoraPorDias(61)).toBe('NARANJA');
			expect(alertaMoraPorDias(90)).toBe('NARANJA');
			expect(alertaMoraPorDias(120)).toBe('NARANJA');
			expect(alertaMoraPorDias(150)).toBe('NARANJA');
		});

		it('usa rojo después de 150 días (más de 5 meses)', () => {
			expect(alertaMoraPorDias(151)).toBe('ROJO');
			expect(alertaMoraPorDias(400)).toBe('ROJO');
		});
	});

	describe('diasDeudaMasAntigua', () => {
		it('toma el comprobante con saldo positivo más viejo', () => {
			expect(
				diasDeudaMasAntigua([
					{ diasAging: 20, saldoPendiente: '100.00' },
					{ diasAging: 150, saldoPendiente: '50.00' }
				])
			).toBe(150);
			expect(diasDeudaMasAntigua([])).toBeNull();
			expect(diasDeudaMasAntigua([{ diasAging: 90, saldoPendiente: '0.00' }])).toBeNull();
		});
	});

	it('calcula el corte como último día del período', () => {
		expect(fechaCortePeriodo('2026-02')).toBe('2026-02-28');
		expect(fechaCortePeriodo('2028-02')).toBe('2028-02-29');
	});

	it('construye la clave de exclusión con las partes de Comp.', () => {
		expect(claveExclusionCobranza({ contacto: '123 Cliente, Ejemplo', tipoComprobante: 'prueba', serie: 'P', numero: '3' })).toBe(
			'numero|123 CLIENTE, EJEMPLO|PRUEBA|P|3'
		);
		expect(claveExclusionCobranza({ contacto: 'Servicio Uno', tipoComprobante: null, serie: null, numero: null })).toBe(
			'sincomprobante|SERVICIO UNO'
		);
	});

	it('distingue tipos distintos con el mismo número y servicio', () => {
		expect(claveExclusionCobranza({ contacto: 'EMPRESA EJEMPLO', tipoComprobante: 'VCre', serie: 'A', numero: '19943' })).not.toBe(
			claveExclusionCobranza({ contacto: 'EMPRESA EJEMPLO', tipoComprobante: 'NCr', serie: 'A', numero: '19943' })
		);
	});

	it('normaliza los tipos de comprobante exportados por Zureo', () => {
		const catalogos = [
			{ nombre: 'Venta Crédito', abreviatura: 'VTA CRED', activo: true },
			{ nombre: 'Venta Crédito Alarma $', abreviatura: 'VC AL $', activo: true },
			{ nombre: 'Nota de Crédito', abreviatura: 'NC', activo: true },
			{ nombre: 'Nota de débito', abreviatura: 'ND', activo: true },
			{ nombre: 'Recibo de Cobro manual', abreviatura: 'REC MAN', activo: true },
			{ nombre: '.e-Recibo de cobro', abreviatura: 'e-RECIBO', activo: true }
		];
		expect(normalizarTipoComprobante('VCre', catalogos)).toBe('Venta Crédito');
		expect(normalizarTipoComprobante('VtaCAp', catalogos)).toBe('Venta Crédito Alarma $');
		expect(normalizarTipoComprobante('NCr', catalogos)).toBe('Nota de Crédito');
		expect(normalizarTipoComprobante('ND', catalogos)).toBe('Nota de débito');
		expect(normalizarTipoComprobante('RCman', catalogos)).toBe('Recibo de Cobro manual');
		expect(normalizarTipoComprobante('e-Reci', catalogos)).toBe('.e-Recibo de cobro');
	});

	it('rechaza serie y número faltantes', () => {
		const errores = validarFilasCobranza([
			{ contacto: 'A', tipoComprobante: 'VCre', serie: '', numero: null, fechaEmision: '2026-10-01', moneda: 'UYU', importe: 1, saldoPendiente: 1 }
		]);
		expect(errores.map((error) => error.mensaje)).toEqual(['No se importó: falta el número de comprobante']);
	});

	it('valida solo variables usables', () => {
		expect(variablesDesconocidas('{{total_pesos}} {{inventada}}')).toEqual(['inventada']);
	});

	it('rechaza comprobantes posteriores al corte y duplicados', () => {
		const filas = [
			{ contacto: 'A', tipoComprobante: 'VCre', serie: 'A', numero: '1', fechaEmision: '2026-11-01', moneda: 'UYU', importe: 1, saldoPendiente: 1 },
			{ contacto: 'A', tipoComprobante: 'VCre', serie: 'A', numero: '1', fechaEmision: '2026-10-01', moneda: 'UYU', importe: 1, saldoPendiente: 1 }
		];
		const errores = validarFilasCobranza(filas, '2026-10-31');
		expect(errores.map((error) => error.mensaje)).toEqual([
			'La fecha de emisión supera el corte 2026-10-31',
			'Comprobante duplicado dentro de la planilla'
		]);
	});
});
