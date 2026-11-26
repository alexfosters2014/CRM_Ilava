import { index, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth.ts';

/**
 * Tabla: permisos_usuario
 *
 * Una fila por pantalla u opción habilitada. `clave` SIEMPRE es una hoja del
 * catálogo declarado en `permisos/catalogo.ts` (nunca un padre): así no existen
 * reglas de denegación ni el bug de revocar un hijo y que el padre lo siga
 * concediendo. El acceso a un padre se deriva de sus hojas.
 *
 * El catálogo vive en código y no en la base a propósito: agregar una pantalla
 * requiere deploy de todas formas (ruta, componente y endpoints), y una tabla
 * espejo sería una segunda lista que se desincroniza. Acá solo se guarda
 * quién tiene qué.
 *
 * Las claves que ya no existen en el catálogo se ignoran al leer (no rompen
 * nada) y el arranque las reporta para poder limpiarlas.
 */
export const permisosUsuario = pgTable(
	'permisos_usuario',
	{
		usuarioId: text('usuario_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		clave: varchar('clave', { length: 80 }).notNull(),
		otorgadoEn: timestamp('otorgado_en', { withTimezone: true }).notNull().defaultNow(),
		otorgadoPor: text('otorgado_por')
	},
	(t) => [
		primaryKey({ columns: [t.usuarioId, t.clave] }),
		index('permisos_usuario_clave_idx').on(t.clave)
	]
);

export type PermisoUsuario = typeof permisosUsuario.$inferSelect;
