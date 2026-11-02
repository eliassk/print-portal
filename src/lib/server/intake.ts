import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { Kind } from '../options.ts';
import { officeToPdf, sanitizePdf } from './tools.ts';

const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'];

export type IntakeError = 'unsupported' | 'mixed' | 'encrypted' | 'officeMissing' | 'broken';
export type Intake = { ok: true; kind: Kind; data: Uint8Array[]; items: number } | { ok: false; error: IntakeError };

const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 5)) === '%PDF-';
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/**
 * Turns uploaded files into a printable source: one document (PDF or Office, cleaned by
 * Ghostscript) or a set of photos (checked by sharp). Anything else is refused.
 */
export async function intake(files: { name: string; data: Uint8Array }[]): Promise<Intake> {
	if (files.length === 0) return { ok: false, error: 'unsupported' };
	const first = files[0];
	if (isPdf(first.data) || OFFICE.includes(ext(first.name))) {
		if (files.length > 1) return { ok: false, error: 'mixed' };
		let pdf = first.data;
		if (!isPdf(pdf)) {
			const converted = await officeToPdf(pdf, ext(first.name)).catch(() => undefined);
			if (converted === null) return { ok: false, error: 'officeMissing' };
			if (!converted) return { ok: false, error: 'broken' };
			pdf = converted;
		}
		try {
			await PDFDocument.load(pdf);
		} catch (e) {
			return { ok: false, error: e instanceof Error && /encrypt/i.test(e.message) ? 'encrypted' : 'broken' };
		}
		try {
			pdf = await sanitizePdf(pdf);
			return { ok: true, kind: 'doc', data: [pdf], items: (await PDFDocument.load(pdf)).getPageCount() };
		} catch {
			return { ok: false, error: 'broken' };
		}
	}
	const images: Uint8Array[] = [];
	for (const f of files) {
		try {
			const meta = await sharp(f.data).metadata();
			if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) return { ok: false, error: files.length > 1 ? 'mixed' : 'unsupported' };
		} catch {
			return { ok: false, error: files.length > 1 ? 'mixed' : 'unsupported' };
		}
		images.push(f.data);
	}
	return { ok: true, kind: 'photo', data: images, items: images.length };
}
