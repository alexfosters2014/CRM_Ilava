import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Capa: Servicios — generación de PDF.
 *
 * Se usa el Chrome/Chromium ya instalado en modo headless (`--print-to-pdf`),
 * sin agregar dependencias ni descargar un navegador. En Windows detecta Chrome
 * o Edge; en el contenedor se instala chromium y se puede fijar `CHROME_PATH`.
 */

const RUTAS_WINDOWS = [
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const RUTAS_LINUX = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];

let cacheRuta: string | null | undefined;

export function rutaNavegador(): string | null {
	if (cacheRuta !== undefined) return cacheRuta;
	const configurada = process.env.CHROME_PATH?.trim();
	if (configurada && existsSync(configurada)) {
		cacheRuta = configurada;
		return cacheRuta;
	}
	for (const ruta of [...RUTAS_WINDOWS, ...RUTAS_LINUX]) {
		if (existsSync(ruta)) {
			cacheRuta = ruta;
			return cacheRuta;
		}
	}
	cacheRuta = null;
	return null;
}

/** Genera un PDF A4 a partir de un HTML completo. */
export async function generarPdf(html: string): Promise<Buffer> {
	const navegador = rutaNavegador();
	if (!navegador) {
		throw new Error('No se encontró Chrome/Chromium para generar el PDF (configurá CHROME_PATH).');
	}
	const carpeta = await mkdtemp(join(tmpdir(), 'crm-pdf-'));
	const entrada = join(carpeta, 'carta.html');
	const salida = join(carpeta, 'carta.pdf');
	try {
		await writeFile(entrada, html, 'utf8');
		await new Promise<void>((resolver, rechazar) => {
			const proceso = spawn(
				navegador,
				[
					'--headless=new',
					'--disable-gpu',
					'--no-sandbox',
					'--disable-dev-shm-usage',
					'--no-pdf-header-footer',
					`--print-to-pdf=${salida}`,
					entrada
				],
				{ stdio: 'ignore' }
			);
			proceso.on('error', rechazar);
			proceso.on('exit', (codigo) =>
				codigo === 0 ? resolver() : rechazar(new Error(`El navegador terminó con código ${codigo}`))
			);
		});
		return await readFile(salida);
	} finally {
		await rm(carpeta, { recursive: true, force: true });
	}
}

/**
 * Envuelve la carta en un documento con la imagen de fondo a página completa.
 * Sin imagen, usa márgenes normales de A4.
 */
export function cartaConFondo(cartaHtml: string, fondo: string | null | undefined): string {
	const estilo = fondo
		? `<style>
			@page { size: A4; margin: 0; }
			html, body { margin: 0; padding: 0; }
			.crm-fondo { position: fixed; inset: 0; background-image: url('${fondo}'); background-size: cover; background-position: center; background-repeat: no-repeat; }
			.crm-contenido { position: relative; padding: 18mm 16mm; font-family: Arial, sans-serif; color: #1f2430; line-height: 1.5; }
			* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		</style>`
		: `<style>
			@page { size: A4; margin: 18mm 16mm; }
			html, body { margin: 0; }
			.crm-contenido { font-family: Arial, sans-serif; color: #1f2430; line-height: 1.5; }
			* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		</style>`;
	const capaFondo = fondo ? '<div class="crm-fondo"></div>' : '';
	return `<!doctype html><html lang="es"><head><meta charset="utf-8">${estilo}</head><body>${capaFondo}<div class="crm-contenido">${cartaHtml}</div></body></html>`;
}
