/**
 * GET /api/docs
 * Página de documentación interactiva (Swagger UI) de la Web API.
 * Carga la especificación desde /api/openapi.json.
 */
export function GET() {
	const html = `<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="utf-8" />
	<title>API CRM — Documentación OpenAPI</title>
	<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
	<style>body { margin: 0; background: #fafafa; }</style>
</head>
<body>
	<div id="swagger-ui"></div>
	<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
	<script>
		window.onload = () => {
			window.ui = SwaggerUIBundle({
				url: '/api/openapi.json',
				dom_id: '#swagger-ui',
				presets: [SwaggerUIBundle.presets.apis],
				layout: 'BaseLayout',
				docExpansion: 'list'
			});
		};
	</script>
</body>
</html>`;

	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
