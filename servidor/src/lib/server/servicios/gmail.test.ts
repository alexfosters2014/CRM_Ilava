import { describe, expect, it } from 'vitest';
import { construirMensaje } from './gmail-mime.ts';

describe('construcción de MIME para Gmail', () => {
	it('genera un raw base64url con Message-ID, Reply-To e In-Reply-To', async () => {
		const { raw, messageId } = await construirMensaje({
			de: { nombre: 'Cobranzas', email: 'cobranza@empresa.com' },
			para: ['cliente@ejemplo.com'],
			cc: ['copia@empresa.com'],
			asunto: '[SEG-2026-000001] Estado de cuenta',
			texto: 'Hola, adjuntamos el estado de cuenta.',
			html: '<p>Hola</p>',
			codigo: 'SEG-2026-000001',
			replyTo: 'seguimiento+SEG-2026-000001@empresa.com',
			inReplyTo: '<anterior@empresa.com>',
			references: '<anterior@empresa.com>'
		});

		expect(messageId).toMatch(/^<[^>]+@empresa\.com>$/);
		expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);

		const mime = Buffer.from(raw, 'base64url').toString('utf8');
		expect(mime).toContain('To: cliente@ejemplo.com');
		expect(mime).toContain('Cc: copia@empresa.com');
		expect(mime).toContain('Subject: [SEG-2026-000001] Estado de cuenta');
		expect(mime).toContain('Message-ID:');
		expect(mime).toContain('Reply-To: seguimiento+SEG-2026-000001@empresa.com');
		expect(mime).toContain('In-Reply-To: <anterior@empresa.com>');
		expect(mime).toMatch(/X-Crm-Referencia: SEG-2026-000001/i);
	});
});
