import { describe, expect, it } from 'vitest';
import { listaEmails, resolverCopias } from './copias.ts';

describe('copias de control interno', () => {
	it('no devuelve copias si está desactivada', () => {
		expect(resolverCopias({ activa: false, emails: 'control@empresa.com', tipo: 'CC' }, ['a@b.com'])).toEqual({
			cc: [],
			bcc: []
		});
	});

	it('usa CC cuando el tipo es visible', () => {
		const copias = resolverCopias({ activa: true, emails: 'control@empresa.com', tipo: 'CC' }, ['cliente@x.com']);
		expect(copias.cc).toEqual(['control@empresa.com']);
		expect(copias.bcc).toEqual([]);
	});

	it('usa CCO cuando el tipo es oculto', () => {
		const copias = resolverCopias({ activa: true, emails: 'control@empresa.com', tipo: 'CCO' }, ['cliente@x.com']);
		expect(copias.cc).toEqual([]);
		expect(copias.bcc).toEqual(['control@empresa.com']);
	});

	it('acepta varios emails separados por coma, punto y coma o salto de línea', () => {
		const copias = resolverCopias(
			{ activa: true, emails: 'uno@x.com, dos@x.com; tres@x.com\ncuatro@x.com', tipo: 'CC' },
			[]
		);
		expect(copias.cc).toHaveLength(4);
	});

	it('no repite una dirección que ya es destinataria', () => {
		const copias = resolverCopias(
			{ activa: true, emails: 'cliente@x.com, control@x.com', tipo: 'CC' },
			['Cliente@X.com']
		);
		expect(copias.cc).toEqual(['control@x.com']);
	});

	it('listaEmails normaliza y descarta vacíos', () => {
		expect(listaEmails(' A@X.com ,, ; b@x.com ')).toEqual(['a@x.com', 'b@x.com']);
		expect(listaEmails(null)).toEqual([]);
	});
});
