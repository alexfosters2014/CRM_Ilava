import { describe, expect, it } from 'vitest';
import {
	construirReplyTo,
	decodificarNotificacionPubSub,
	extraerAliasSeguimiento,
	extraerAliasTicket,
	extraerCodigoSeguimiento,
	extraerCodigoTicket,
	extraerEmail,
	extraerEmails,
	limpiarRespuestaCorreo
} from './gmail-texto.ts';

describe('helpers de vinculación de Gmail', () => {
	it('extrae el código de seguimiento del asunto aunque haya texto alrededor', () => {
		expect(extraerCodigoSeguimiento('Estado de cuenta – Servicio 1037 [SEG-2026-000123]')).toBe(
			'SEG-2026-000123'
		);
		expect(extraerCodigoSeguimiento('[seg-2026-000001] re:')).toBe('SEG-2026-000001');
		expect(extraerCodigoSeguimiento('sin código')).toBeNull();
	});

	it('extrae el código de ticket del asunto', () => {
		expect(extraerCodigoTicket('Re: [TCK-000241] diferencia de saldo')).toBe('TCK-000241');
		expect(extraerCodigoTicket('[SEG-2026-000001] no es ticket')).toBeNull();
	});

	it('reconoce el alias de plus-addressing', () => {
		expect(extraerAliasSeguimiento('seguimiento+SEG-2026-000123@empresa.com')).toBe(
			'SEG-2026-000123'
		);
		expect(extraerAliasSeguimiento('cobranza+SEG-2026-000123@empresa.com')).toBe(
			'SEG-2026-000123'
		);
		expect(extraerAliasSeguimiento('Cobranzas <cobranza@empresa.com>')).toBeNull();
		expect(extraerAliasTicket('facturacion+tck-000002@gmail.com')).toBe('TCK-000002');
		expect(extraerAliasTicket('seguimiento+SEG-2026-000123@empresa.com')).toBeNull();
	});

	it('arma el Reply-To con plus-addressing', () => {
		expect(construirReplyTo('cobranza@empresa.com', 'SEG-2026-000123')).toBe(
			'cobranza+SEG-2026-000123@empresa.com'
		);
		expect(construirReplyTo('facturacion@gmail.com', 'TCK-000002')).toBe(
			'facturacion+TCK-000002@gmail.com'
		);
		expect(construirReplyTo('sin-arroba', 'SEG-2026-000001')).toBe('sin-arroba');
	});

	it('extrae correos de cabeceras con nombre y varios destinatarios', () => {
		expect(extraerEmail('Ana Pérez <Ana.Perez@Empresa.com>')).toBe('ana.perez@empresa.com');
		expect(extraerEmails('a@x.com, "B" <b@y.com>; a@x.com')).toEqual(['a@x.com', 'b@y.com']);
	});

	it('deja solo el texto nuevo de una respuesta de Outlook', () => {
		const cuerpo = [
			'Re: [TCK-000002] Instalacion',
			'',
			'quiero oooo',
			'',
			'Obtener Outlook para Android<https://aka.ms/AAb9ysg>',
			'________________________________',
			'From: facturacion <facturacion@gmail.com>',
			'Sent: Wednesday, 18 November 2026 01:11:07',
			'To: operador@ejemplo.com; facturacion@outlook.com',
			'Subject: [TCK-000002] Instalacion',
			'',
			'isn'
		].join('\n');
		expect(limpiarRespuestaCorreo(cuerpo)).toBe('quiero oooo');
	});

	it('deja solo el texto nuevo de una respuesta de Gmail', () => {
		const cuerpo = [
			'Hola, ya lo revisé.',
			'',
			'El mié, 18 nov 2026 a las 1:11, Usuario Ejemplo <facturacion@gmail.com> escribió:',
			'> mensaje anterior',
			'> más texto citado'
		].join('\n');
		expect(limpiarRespuestaCorreo(cuerpo)).toBe('Hola, ya lo revisé.');
	});

	it('limpia la cita de Gmail cuando la atribución ocupa dos líneas', () => {
		const cuerpo = [
			'Aprobado !!!',
			'',
			'El mié, 18 nov 2026 a la(s) 4:54 p.m., Cobranza Vector (',
			'finanzas@vector.com.uy) escribió:',
			'',
			'-- ',
			'',
			'Saludos',
			'Alexis'
		].join('\n');
		expect(limpiarRespuestaCorreo(cuerpo)).toBe('Aprobado !!!');
	});

	it('no rompe un mensaje sin cita', () => {
		expect(limpiarRespuestaCorreo('Respuesta simple\ncon dos líneas')).toBe(
			'Respuesta simple\ncon dos líneas'
		);
	});

	it('decodifica la notificación de Pub/Sub', () => {
		const data = Buffer.from(
			JSON.stringify({ emailAddress: 'Cobranza@Empresa.com', historyId: 123456 })
		).toString('base64');
		expect(decodificarNotificacionPubSub(data)).toEqual({
			emailAddress: 'cobranza@empresa.com',
			historyId: '123456'
		});
	});

	it('rechaza notificaciones inválidas', () => {
		expect(() => decodificarNotificacionPubSub('%%%')).toThrow();
		const sinEmail = Buffer.from(JSON.stringify({ historyId: 1 })).toString('base64');
		expect(() => decodificarNotificacionPubSub(sinEmail)).toThrow(/emailAddress/);
	});
});
