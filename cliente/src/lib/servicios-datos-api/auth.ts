import { createAuthClient } from 'better-auth/svelte';
import { emailOTPClient } from 'better-auth/client/plugins';

/**
 * Capa: ServiciosDatosAPI (auth)
 *
 * Único punto del frontend que habla con la API de autenticación. Better Auth
 * monta sus endpoints en `/api/auth/*` (ver `isAuthPath` en hooks.server.ts del
 * servidor). Como el frontend llama a su propio `/api` (proxy reenvía a
 * API_URL), acá NO se pasa baseURL: se usa el origin actual, así el proxy
 * reenvía al servidor y evitamos CORS y configurar la URL dos veces.
 *
 * Flujo OTP: `enviarCodigo()` manda el código de 6 dígitos al correo, y
 * `entrarConCodigo()` lo verifica y crea la sesión.
 */
export const authClient = createAuthClient({
	plugins: [emailOTPClient()]
});

/** Pide al servidor enviar un OTP de acceso al correo dado. */
export function enviarCodigo(email: string) {
	return authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
}

/** Verifica el OTP y crea la sesión (login). */
export function entrarConCodigo(email: string, otp: string) {
	return authClient.signIn.emailOtp({ email, otp });
}

/** Devuelve la sesión actual del usuario, o null si no hay. */
export function obtenerSesion() {
	return authClient.getSession();
}

/** Cierra la sesión actual. */
export function salir() {
	return authClient.signOut();
}
