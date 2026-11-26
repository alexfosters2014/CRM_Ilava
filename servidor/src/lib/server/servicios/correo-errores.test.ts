import { describe, expect, it } from 'vitest';
import { clasificarErrorCorreo } from './correo-errores.ts';

function errorSmtp(datos: Record<string, unknown>) {
	return Object.assign(new Error(String(datos.message ?? 'Error SMTP')), datos);
}

describe('clasificarErrorCorreo', () => {
	it('detecta una contraseña rechazada por Gmail', () => {
		const resultado = clasificarErrorCorreo(
			errorSmtp({
				code: 'EAUTH',
				responseCode: 535,
				response: '535-5.7.8 Username and Password not accepted.',
				message: 'Invalid login: 535-5.7.8 Username and Password not accepted.'
			})
		);
		expect(resultado.tipo).toBe('AUTENTICACION');
		expect(resultado.codigo).toBe('EAUTH');
		expect(resultado.explicacion).toContain('contraseña');
	});

	it('detecta la falta de contraseña de aplicación', () => {
		const resultado = clasificarErrorCorreo(
			errorSmtp({ responseCode: 534, message: '534-5.7.9 Application-specific password required' })
		);
		expect(resultado.tipo).toBe('AUTENTICACION');
	});

	it('detecta un problema de conexión', () => {
		const resultado = clasificarErrorCorreo(
			errorSmtp({ code: 'ETIMEDOUT', message: 'Connection timeout' })
		);
		expect(resultado.tipo).toBe('CONEXION');
	});

	it('detecta un destinatario rechazado', () => {
		const resultado = clasificarErrorCorreo(
			errorSmtp({ code: 'EENVELOPE', responseCode: 550, message: '550 5.1.1 User unknown' })
		);
		expect(resultado.tipo).toBe('DESTINATARIO');
	});

	it('detecta demasiados intentos de login', () => {
		const resultado = clasificarErrorCorreo(
			errorSmtp({ responseCode: 454, message: '454 4.7.0 Too many login attempts' })
		);
		expect(resultado.tipo).toBe('LIMITE');
	});

	it('deja como desconocido un error sin señales', () => {
		const resultado = clasificarErrorCorreo(new Error('Algo salió mal'));
		expect(resultado.tipo).toBe('DESCONOCIDO');
	});
});
