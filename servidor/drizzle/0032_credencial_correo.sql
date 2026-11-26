-- Estado de la credencial SMTP y clasificación de los errores de envío.
--
-- `credencial_estado` permite detectar una contraseña cambiada o revocada sin
-- esperar a que fallen todos los envíos. `error_tipo` guarda la clasificación
-- del error (AUTENTICACION, CONEXION, DESTINATARIO, LIMITE, CONTENIDO).

ALTER TABLE "cuentas_correo" ADD COLUMN "credencial_estado" text DEFAULT 'SIN_VERIFICAR' NOT NULL;
ALTER TABLE "cuentas_correo" ADD COLUMN "credencial_error" text;
ALTER TABLE "cuentas_correo" ADD COLUMN "credencial_verificada_en" timestamp with time zone;
ALTER TABLE "cuentas_correo" ADD CONSTRAINT "cuentas_correo_credencial_estado_chk" CHECK ("credencial_estado" in ('SIN_VERIFICAR', 'OK', 'RECHAZADA'));

ALTER TABLE "envios_cobranza" ADD COLUMN "error_tipo" text;
ALTER TABLE "lotes_envio_cobranza_items" ADD COLUMN "error_tipo" text;
