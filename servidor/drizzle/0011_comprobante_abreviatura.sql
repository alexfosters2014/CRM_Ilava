ALTER TABLE "tipos_comprobantes" ADD COLUMN "abreviatura" varchar(8);--> statement-breakpoint

-- Abreviaturas para los chips de la tabla (máximo 8 caracteres).
UPDATE "tipos_comprobantes" SET "abreviatura" = 'e-RECIBO' WHERE "nombre" = '.e-Recibo de cobro';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'CMP CONT' WHERE "nombre" = 'Compra Contado';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'CMP CRED' WHERE "nombre" = 'Compra Crédito';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'NC' WHERE "nombre" = 'Nota de Crédito';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'NC ALARM' WHERE "nombre" = 'Nota de Crédito Alarma';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'NC ALUSD' WHERE "nombre" = 'Nota de Crédito Alarma USD';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'NC EXENT' WHERE "nombre" = 'Nota de Credito Exenta';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'NC TECNO' WHERE "nombre" = 'Nota de Crédito Tecnologia';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'ND' WHERE "nombre" = 'Nota de débito';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'REC MAN' WHERE "nombre" = 'Recibo de Cobro manual';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC EXENT' WHERE "nombre" = 'Venta a Credito Exenta';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VTA CONT' WHERE "nombre" = 'Venta Contado';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC TAR $' WHERE "nombre" = 'Venta Contado Tarjeta $';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC T USD' WHERE "nombre" = 'Venta Contado Tarjetas USD';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VTA CRED' WHERE "nombre" = 'Venta Crédito';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC AL $' WHERE "nombre" = 'Venta Crédito Alarma $';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC MAN' WHERE "nombre" = 'Venta crédito manual';--> statement-breakpoint
UPDATE "tipos_comprobantes" SET "abreviatura" = 'VC TECNO' WHERE "nombre" = 'Venta Crédito Tecnología';
