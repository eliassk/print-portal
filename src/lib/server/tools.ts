import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';

const run = promisify(execFile);

async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), 'print-portal-'));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Rewrites a PDF through Ghostscript. This drops scripts, forms actions and broken objects,
 * and leaves a plain PDF the printer reads reliably. -dSAFER MUST stay on.
 */
export function sanitizePdf(pdf: Uint8Array): Promise<Uint8Array> {
	return inTemp(async (dir) => {
		const src = join(dir, 'in.pdf');
		const out = join(dir, 'out.pdf');
		await writeFile(src, pdf);
		await run(
			env.GS_PATH ?? 'gs',
			['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=pdfwrite', '-dPDFSETTINGS=/prepress', `-sOutputFile=${out}`, src],
			{ timeout: 120_000 }
		);
		return new Uint8Array(await readFile(out));
	});
}

/** Converts Word, Excel, PowerPoint or OpenDocument files to PDF. Returns null when LibreOffice is missing. */
export function officeToPdf(data: Uint8Array, ext: string): Promise<Uint8Array | null> {
	return officeConvert(data, ext, 'pdf');
}

/** Converts a spreadsheet (.xls, .ods) to .xlsx. Returns null when LibreOffice is missing. */
export function sheetToXlsx(data: Uint8Array, ext: string): Promise<Uint8Array | null> {
	return officeConvert(data, ext, 'xlsx');
}

function officeConvert(data: Uint8Array, ext: string, to: 'pdf' | 'xlsx'): Promise<Uint8Array | null> {
	return inTemp(async (dir) => {
		const src = join(dir, `in.${ext}`);
		await writeFile(src, data);
		try {
			await run(
				env.SOFFICE_PATH ?? 'soffice',
				[`-env:UserInstallation=file://${dir}/profile`, '--headless', '--convert-to', to, '--outdir', join(dir, 'out'), src],
				{ timeout: 120_000 }
			);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw e;
		}
		const out = (await readdir(join(dir, 'out'))).find((f) => f.endsWith(`.${to}`));
		if (!out) throw new Error(`LibreOffice produced no ${to}`);
		return new Uint8Array(await readFile(join(dir, 'out', out)));
	});
}

/** Renders one page of a PDF to PNG with Poppler. */
export function renderPage(pdf: Uint8Array, page: number, dpi = 60): Promise<Uint8Array> {
	return inTemp(async (dir) => {
		const src = join(dir, 'in.pdf');
		await writeFile(src, pdf);
		await run(
			env.PDFTOPPM_PATH ?? 'pdftoppm',
			['-png', '-r', String(dpi), '-f', String(page), '-l', String(page), '-singlefile', src, join(dir, 'out')],
			{ timeout: 30_000 }
		);
		return new Uint8Array(await readFile(join(dir, 'out.png')));
	});
}
