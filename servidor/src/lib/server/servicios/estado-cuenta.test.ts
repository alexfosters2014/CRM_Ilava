import { describe, expect, it } from 'vitest';
import { cuerpoHtml, tablaHtml, tablaTexto, type FilaEstadoCuenta } from './estado-cuenta.ts';

const filas: FilaEstadoCuenta[] = [
	{
		numero: '15047',
		tipoComprobante: 'Venta Crédito Alarma $',
		serie: 'A',
		vencimiento: '2026-11-30',
		fechaEmision: '2026-10-31',
		importe: '4317.01',
		saldo: '1435.04',
		moneda: 'UYU'
	},
	{
		numero: '4754',
		tipoComprobante: 'Recibo de Cobro manual',
		serie: '',
		vencimiento: null,
		fechaEmision: '2026-11-02',
		importe: '100',
		saldo: '100',
		moneda: 'UYU'
	}
];

describe('estado de cuenta', () => {
	it('arma la tabla HTML con encabezados, filas y total', () => {
		const html = tablaHtml(filas, 'UYU');
		expect(html).toContain('<table');
		expect(html).toContain('Emisión');
		expect(html).toContain('Vencimiento');
		expect(html).toContain('Comprobante');
		expect(html).toContain('Venta Crédito Alarma $ A-15047');
		expect(html).toContain('Recibo de Cobro manual 4754');
		expect(html).toContain('31/10/2026');
		expect(html).toContain('Total UYU');
		// 1435.04 + 100
		expect(html).toContain('1.535,04');
	});

	it('genera la tabla en una sola línea, sin saltos ni <br> internos', () => {
		const html = tablaHtml(filas, 'UYU');
		expect(html).not.toContain('\n');
		expect(html).not.toContain('<br');
		expect(html).toContain('cellspacing="0"');
	});

	it('se ajusta al contenido en lugar de ocupar todo el ancho', () => {
		const html = tablaHtml(filas, 'UYU');
		expect(html).toContain('style="width:auto;max-width:100%');
		expect(html).not.toMatch(/style="width:100%"/);
		// El comprobante puede envolver; las fechas e importes no.
		expect(html).toContain('white-space:normal;max-width:260px');
		expect(html).toContain('white-space:nowrap');
	});

	it('informa cuando no hay comprobantes en la moneda', () => {
		expect(tablaHtml([], 'USD')).toContain('Sin comprobantes en USD');
	});

	it('arma el texto plano con el total', () => {
		const texto = tablaTexto(filas, 'UYU');
		expect(texto).toContain('Venta Crédito Alarma $ A-15047');
		expect(texto).toContain('Total UYU:');
	});

	it('convierte el cuerpo a HTML, reemplaza variables e inyecta tablas', () => {
		const html = cuerpoHtml(
			'Hola {{nombre_servicio}}\nTotal: {{total_pesos}}\n{{estado_cuenta_pesos}}',
			{ nombre_servicio: 'EMPRESA EJEMPLO <S.A.>', total_pesos: '$ 1.535,04' },
			{ pesos: '<table id="pesos"></table>', dolares: '<table id="dolares"></table>' }
		);
		expect(html).toContain('Hola EMPRESA EJEMPLO &lt;S.A.&gt;<br>');
		expect(html).toContain('Total: $ 1.535,04');
		expect(html).toContain('<table id="pesos"></table>');
		expect(html).not.toContain('{{');
		// La tabla inyectada no debe contener saltos convertidos a <br>.
		expect(html).not.toContain('<table id="pesos"><br>');
	});

	it('inyecta la variable general y respeta mayúsculas', () => {
		const html = cuerpoHtml(
			'{{Estado_Cuenta_General}}',
			{},
			{ pesos: '<table id="pesos"></table>', dolares: '<table id="dolares"></table>', general: '<table id="pesos"></table><table id="dolares"></table>' }
		);
		expect(html).toContain('<table id="pesos"></table><table id="dolares"></table>');
		expect(html).not.toContain('{{');
	});

	it('la tabla vacía informa la moneda pero la general no la incluye', () => {
		expect(tablaHtml([], 'USD')).toContain('Sin comprobantes en USD');
		const general = '' + tablaHtml(filas, 'UYU');
		expect(general).not.toContain('Sin comprobantes');
	});

	it('no convierte en <br> los saltos internos de la tabla real', () => {
		const html = cuerpoHtml('Hola\n{{estado_cuenta_pesos}}', {}, {
			pesos: tablaHtml(filas, 'UYU'),
			dolares: ''
		});
		const desde = html.indexOf('<table');
		const hasta = html.indexOf('</table>') + '</table>'.length;
		expect(desde).toBeGreaterThan(-1);
		expect(html.slice(desde, hasta)).not.toContain('<br');
	});
});
