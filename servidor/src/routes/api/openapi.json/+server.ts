import { especificacionOpenApi } from '#lib/openapi.ts';

/**
 * GET /api/openapi.json
 * Especificación OpenAPI 3.0 de todos los endpoints de la API.
 */
export function GET() {
	return new Response(JSON.stringify(especificacionOpenApi), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' }
	});
}
