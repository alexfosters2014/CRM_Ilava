import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { leerPlanillaEmails, mapearFilasPlanilla } from '../../src/lib/servicios/planilla-emails.ts';

describe('mapearFilasPlanilla', () => {
	it('lee las columnas generadas por la planilla', () => {
		const resultado = mapearFilasPlanilla([
			{ ID: 12, Servicio: '1002 MARCELA CIKATO', 'Mails de cobranza': 'a@x.com; b@y.com' },
			{ ID: 13, Servicio: '1003 OTRO', 'Mails de cobranza': '' }
		]);
		expect(resultado.errores).toEqual([]);
		expect(resultado.filas).toEqual([
			{ servicioId: 12, emails: 'a@x.com; b@y.com' },
			{ servicioId: 13, emails: '' }
		]);
	});

	it('acepta encabezados alternativos y sin acentos', () => {
		const resultado = mapearFilasPlanilla([
			{ id: '7', 'servicio / contacto': 'Cliente', Emails: 'x@y.com' }
		]);
		expect(resultado.errores).toEqual([]);
		expect(resultado.filas).toEqual([{ servicioId: 7, emails: 'x@y.com' }]);
	});

	it('descarta filas totalmente vacías', () => {
		const resultado = mapearFilasPlanilla([
			{ ID: 1, Servicio: 'Cliente', 'Mails de cobranza': '' },
			{ ID: '', Servicio: '', 'Mails de cobranza': '' }
		]);
		expect(resultado.filas).toHaveLength(1);
		expect(resultado.errores).toEqual([]);
	});

	it('reporta ID inválidos y servicios repetidos', () => {
		const resultado = mapearFilasPlanilla([
			{ ID: 'abc', Servicio: 'Cliente', 'Mails de cobranza': 'a@x.com' },
			{ ID: 5, Servicio: 'Uno', 'Mails de cobranza': 'a@x.com' },
			{ ID: 5, Servicio: 'Repetido', 'Mails de cobranza': 'b@x.com' }
		]);
		expect(resultado.filas).toHaveLength(1);
		expect(resultado.errores).toEqual([
			{ fila: 2, mensaje: 'ID de servicio inválido' },
			{ fila: 4, mensaje: 'El servicio 5 está repetido en la planilla' }
		]);
	});

	it('avisa cuando no hay ninguna fila con ID', () => {
		const resultado = mapearFilasPlanilla([{ ID: '', Servicio: '', 'Mails de cobranza': '' }]);
		expect(resultado.filas).toEqual([]);
		expect(resultado.errores).toEqual([
			{ fila: 0, mensaje: 'La planilla no tiene filas con ID de servicio' }
		]);
	});

	it('lee un archivo xlsx generado con la planilla', async () => {
		const hoja = XLSX.utils.json_to_sheet([
			{ ID: 12, Servicio: 'Cliente', 'Mails de cobranza': 'a@x.com; b@y.com' },
			{ ID: 13, Servicio: 'Otro', 'Mails de cobranza': '' }
		]);
		const libro = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(libro, hoja, 'Mails');
		const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
		const archivo = new File([buffer], 'mails-cobranza.xlsx');
		const resultado = await leerPlanillaEmails(archivo);
		expect(resultado.errores).toEqual([]);
		expect(resultado.filas).toEqual([
			{ servicioId: 12, emails: 'a@x.com; b@y.com' },
			{ servicioId: 13, emails: '' }
		]);
	});
});
