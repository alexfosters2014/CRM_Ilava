import { describe, expect, it } from 'vitest';
import {
	coincideEnvios,
	coincideTramo,
	seEnviaDocumento,
	totalesEnvio
} from '../../src/lib/servicios/filtros-cobranza.ts';
import { plantillaListaComprobantes } from '../../src/lib/servicios/plantillas-cobranza.ts';

const servicio = {
	tramoAntiguedad: 'MAS_90',
	pesos: { A_VENCER: '0', '1_30': '1500', '31_60': '0', '61_90': '0', MAS_90: '800' },
	dolares: { A_VENCER: '0', '1_30': '0', '31_60': '0', '61_90': '0', MAS_90: '120' },
	envios: 2
};

describe('coincideTramo', () => {
	it('TODOS siempre coincide', () => {
		expect(coincideTramo(servicio, 'TODOS')).toBe(true);
	});

	it('coincide solo con el tramo de la deuda más antigua', () => {
		expect(coincideTramo(servicio, 'MAS_90')).toBe(true);
		// Tiene saldo reciente, pero su deuda más vieja es +90: no es "1–30".
		expect(coincideTramo(servicio, '1_30')).toBe(false);
		expect(coincideTramo(servicio, '61_90')).toBe(false);
		expect(coincideTramo(servicio, 'A_VENCER')).toBe(false);
	});

	it('un servicio sin deuda no entra en ningún tramo', () => {
		expect(coincideTramo({ ...servicio, tramoAntiguedad: null }, 'MAS_90')).toBe(false);
		expect(coincideTramo({ ...servicio, tramoAntiguedad: null }, 'TODOS')).toBe(true);
	});

	it('un servicio solo con deuda reciente cae en 1–30', () => {
		expect(coincideTramo({ ...servicio, tramoAntiguedad: '1_30' }, '1_30')).toBe(true);
		expect(coincideTramo({ ...servicio, tramoAntiguedad: '1_30' }, 'MAS_90')).toBe(false);
	});
});

describe('seEnviaDocumento', () => {
	it('sin "solo vencidos" envía todo lo no excluido', () => {
		expect(seEnviaDocumento({ excluidoEnvio: false, vencida: false }, false)).toBe(true);
		expect(seEnviaDocumento({ excluidoEnvio: true, vencida: true }, false)).toBe(false);
	});

	it('con "solo vencidos" exige vencida y sin exclusión', () => {
		expect(seEnviaDocumento({ excluidoEnvio: false, vencida: true }, true)).toBe(true);
		expect(seEnviaDocumento({ excluidoEnvio: false, vencida: false }, true)).toBe(false);
		expect(seEnviaDocumento({ excluidoEnvio: true, vencida: true }, true)).toBe(false);
	});
});

describe('totalesEnvio', () => {
	const documentos = [
		{ moneda: 'UYU', importe: '5000', saldoPendiente: '4720', excluidoEnvio: false, vencida: true },
		{ moneda: 'UYU', importe: '5000', saldoPendiente: '1000', excluidoEnvio: true, vencida: true },
		{ moneda: 'UYU', importe: '5000', saldoPendiente: '2500', excluidoEnvio: false, vencida: false },
		{ moneda: 'USD', importe: '300', saldoPendiente: '120', excluidoEnvio: false, vencida: true }
	];

	it('suma saldos pendientes, no importes emitidos', () => {
		const totales = totalesEnvio(documentos, false, 40);
		expect(totales.cantidad).toBe(3);
		expect(totales.pesos).toBe(7220);
		expect(totales.dolares).toBe(120);
		expect(totales.importePesos).toBe(10000);
		expect(totales.equivalentePesos).toBe(7220 + 120 * 40);
	});

	it('la exclusión temporal descuenta del total', () => {
		const sinExclusion = documentos.map((documento) => ({ ...documento, excluidoEnvio: false }));
		const conExclusion = totalesEnvio(documentos, false, 40);
		const completo = totalesEnvio(sinExclusion, false, 40);
		expect(completo.pesos - conExclusion.pesos).toBe(1000);
		expect(conExclusion.cantidad).toBe(completo.cantidad - 1);
	});

	it('con "solo vencidos" descuenta los que todavía no vencieron', () => {
		const todos = totalesEnvio(documentos, false, 40);
		const vencidos = totalesEnvio(documentos, true, 40);
		expect(todos.pesos - vencidos.pesos).toBe(2500);
		expect(vencidos.cantidad).toBe(2);
		expect(vencidos.pesos).toBe(4720);
	});
});

describe('plantillaListaComprobantes', () => {
	it('detecta el listado general en el cuerpo con cualquier espaciado', () => {
		expect(plantillaListaComprobantes({ cuerpo: 'Hola {{estado_cuenta_general}}' })).toBe(true);
		expect(plantillaListaComprobantes({ cuerpo: '{{ ESTADO_CUENTA_GENERAL }}' })).toBe(true);
	});

	it('acepta las variantes por moneda', () => {
		expect(plantillaListaComprobantes({ cuerpo: '{{estado_cuenta_pesos}}' })).toBe(true);
		expect(plantillaListaComprobantes({ cuerpo: '{{estado_cuenta_dolares}}' })).toBe(true);
	});

	it('requiere la carta habilitada para contar la variable del PDF', () => {
		expect(
			plantillaListaComprobantes({
				cuerpo: 'Sin tabla',
				cartaHabilitada: true,
				cartaHtml: '{{estado_cuenta_general}}'
			})
		).toBe(true);
		expect(
			plantillaListaComprobantes({
				cuerpo: 'Sin tabla',
				cartaHabilitada: false,
				cartaHtml: '{{estado_cuenta_general}}'
			})
		).toBe(false);
	});

	it('rechaza una plantilla sin listado', () => {
		expect(plantillaListaComprobantes({ cuerpo: 'Total {{total_pesos}}' })).toBe(false);
	});
});

describe('coincideEnvios', () => {
	it('TODOS siempre coincide', () => {
		expect(coincideEnvios(0, 'TODOS')).toBe(true);
	});

	it('coincide con el número exacto', () => {
		expect(coincideEnvios(2, '2')).toBe(true);
		expect(coincideEnvios(2, '3')).toBe(false);
		expect(coincideEnvios(0, '0')).toBe(true);
	});

	it('MAS_4 incluye cuatro o más', () => {
		expect(coincideEnvios(3, 'MAS_4')).toBe(false);
		expect(coincideEnvios(4, 'MAS_4')).toBe(true);
		expect(coincideEnvios(10, 'MAS_4')).toBe(true);
	});
});
