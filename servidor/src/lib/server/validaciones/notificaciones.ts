import { z } from 'zod';

export const marcarNotificacionSchema = z.object({
	origen: z.enum(['TICKET', 'SEGUIMIENTO']),
	id: z.number().int().positive()
});
