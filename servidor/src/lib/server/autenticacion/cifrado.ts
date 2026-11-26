import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Capa: Autenticación — cifrado de credenciales.
 *
 * Las claves SMTP de las cuentas de correo se guardan cifradas en PostgreSQL
 * con AES-256-GCM. La clave maestra vive fuera de la base (variable de entorno
 * `CORREO_CLAVE`), así un dump de la base no expone contraseñas.
 *
 * Formato almacenado: `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */

const VERSION = 'v1';
const SAL = 'crm-correo-cuentas';

let cacheClave: Buffer | null = null;

function claveMaestra(): Buffer {
	// Se lee de process.env y no de `$app/env/private` para que la misma clave
	// funcione en desarrollo local y en el contenedor (variables inyectadas).
	const secreto = process.env.CORREO_CLAVE?.trim();
	if (!secreto || secreto.length < 16) {
		throw new Error(
			'Falta CORREO_CLAVE (mínimo 16 caracteres) para cifrar las credenciales de correo.'
		);
	}
	if (!cacheClave) cacheClave = scryptSync(secreto, SAL, 32);
	return cacheClave;
}

/** Cifra un texto plano. Devuelve el formato versionado listo para guardar. */
export function cifrarCredencial(texto: string): string {
	const iv = randomBytes(12);
	const cifrador = createCipheriv('aes-256-gcm', claveMaestra(), iv);
	const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
	const tag = cifrador.getAuthTag();
	return [VERSION, iv.toString('base64'), tag.toString('base64'), cifrado.toString('base64')].join(':');
}

/** Descifra un valor guardado con `cifrarCredencial`. */
export function descifrarCredencial(valor: string): string {
	const partes = valor.split(':');
	if (partes.length !== 4 || partes[0] !== VERSION) {
		throw new Error('La credencial guardada tiene un formato desconocido.');
	}
	const [, iv, tag, cifrado] = partes;
	const descifrador = createDecipheriv('aes-256-gcm', claveMaestra(), Buffer.from(iv, 'base64'));
	descifrador.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([
		descifrador.update(Buffer.from(cifrado, 'base64')),
		descifrador.final()
	]).toString('utf8');
}
