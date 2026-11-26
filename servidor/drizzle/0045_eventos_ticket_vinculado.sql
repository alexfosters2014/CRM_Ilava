-- Los tickets creados desde un seguimiento antes de este fix podian no tener
-- evento TICKET: el caso bloqueante solo dejaba el cambio de estado, asi que
-- el historial no mostraba la tarjeta del ticket vinculado. Se crea el evento
-- faltante con la fecha original del vinculo.
--
-- Idempotente: solo agrega cuando no existe el evento de creacion (los eventos
-- de actualizacion del ticket traen metadatos.tipoEvento y no cuentan).
INSERT INTO "seguimientos_eventos" (
	"seguimiento_id",
	"tipo",
	"canal",
	"direccion",
	"contenido",
	"autor_usuario_id",
	"autor_nombre",
	"fecha_hora",
	"ticket_id",
	"metadatos"
)
SELECT
	st."seguimiento_id",
	'TICKET',
	'SISTEMA',
	'INTERNA',
	'Vinculó el ticket ' || t."codigo_visible" || ' al seguimiento.',
	CASE WHEN u."id" IS NOT NULL THEN st."creado_por" ELSE NULL END,
	u."name",
	st."creado_en",
	st."ticket_id",
	jsonb_build_object(
		'codigo', t."codigo_visible",
		'titulo', t."titulo",
		'bloqueante', st."bloqueante",
		'motivoBloqueo', st."motivo_bloqueo"
	)
FROM "seguimientos_tickets" st
JOIN "tickets" t ON t."id" = st."ticket_id"
LEFT JOIN "user" u ON u."id" = st."creado_por"
WHERE NOT EXISTS (
	SELECT 1
	FROM "seguimientos_eventos" e
	WHERE e."seguimiento_id" = st."seguimiento_id"
	  AND e."ticket_id" = st."ticket_id"
	  AND e."tipo" = 'TICKET'
	  AND (e."metadatos" IS NULL OR e."metadatos"->>'tipoEvento' IS NULL)
);
