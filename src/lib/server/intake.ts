import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { Kind } from '../options.ts';
import { officeToPdf, sanitizePdf, sheetToXlsx } from './tools.ts';
import { prepareBook, readBook, type Book, type SheetPick } from './workbook.ts';

const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'];
const SHEETS = ['xls', 'xlsx', 'ods'];

export type IntakeError = 'unsupported' | 'mixed' | 'encrypted' | 'officeMissing' | 'broken';
/** A spreadsheet keeps its .xlsx next to the PDF, so the sheet choice can be changed later. */
export type Workbook = { xlsx: Uint8Array; book: Book; pick: SheetPick };
export type Intake = { ok: true; kind: Kind; data: Uint8Array[]; items: number; workbook?: Workbook } | { ok: false; error: IntakeError };
type DocResult = { ok: true; pdf: Uint8Array; pages: number } | { ok: false; error: IntakeError };

const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 5)) === '%PDF-';
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/**
 * Turns uploaded files into a printable source: one document (PDF or Office, cleaned by
 * Ghostscript) or a set of photos (checked by sharp). Anything else is refused.
 */
export async function intake(files: { name: string; data: Uint8Array }[]): Promise<Intake> {
	if (files.length === 0) return { ok: false, error: 'unsupported' };
	const first = files[0];
	if (!isPdf(first.data) && SHEETS.includes(ext(first.name))) {
		if (files.length > 1) return { ok: false, error: 'mixed' };
		return intakeSheet(first.data, ext(first.name));
	}
	if (isPdf(first.data) || OFFICE.includes(ext(first.name))) {
		if (files.length > 1) return { ok: false, error: 'mixed' };
		let pdf = first.data;
		if (!isPdf(pdf)) {
			const converted = await officeToPdf(pdf, ext(first.name));
			if (!converted.ok) return converted;
			pdf = converted.data;
		}
		const r = await cleanPdf(pdf);
		return r.ok ? { ok: true, kind: 'doc', data: [r.pdf], items: r.pages } : r;
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

async function cleanPdf(pdf: Uint8Array): Promise<DocResult> {
	try {
		await PDFDocument.load(pdf);
	} catch (e) {
		return { ok: false, error: e instanceof Error && /encrypt/i.test(e.message) ? 'encrypted' : 'broken' };
	}
	try {
		pdf = await sanitizePdf(pdf);
		return { ok: true, pdf, pages: (await PDFDocument.load(pdf)).getPageCount() };
	} catch {
		return { ok: false, error: 'broken' };
	}
}

/** Starts with the active sheet and its data range, fitted to the page width. */
async function intakeSheet(data: Uint8Array, extension: string): Promise<Intake> {
	let xlsx = data;
	if (extension !== 'xlsx') {
		const converted = await sheetToXlsx(data, extension);
		if (!converted.ok) return converted;
		xlsx = converted.data;
	}
	let book: Book;
	try {
		book = readBook(xlsx);
	} catch {
		// An encrypted .xlsx is not a zip file.
		return { ok: false, error: 'encrypted' };
	}
	if (!book.sheets.length) return { ok: false, error: 'broken' };
	const active = book.sheets[book.active];
	const pick: SheetPick = { sheets: [{ name: active.name, range: active.range ?? '' }], fit: true };
	const r = await printBook(xlsx, pick);
	return r.ok ? { ok: true, kind: 'doc', data: [r.pdf], items: r.pages, workbook: { xlsx, book, pick } } : r;
}

/** Renders the picked sheets to a clean PDF. Throws RangeError on a bad pick. */
export async function printBook(xlsx: Uint8Array, pick: SheetPick, orientation: 'portrait' | 'landscape' | null = null): Promise<DocResult> {
	const prepared = prepareBook(xlsx, pick, orientation);
	const converted = await officeToPdf(prepared, 'xlsx');
	return converted.ok ? cleanPdf(converted.data) : converted;
}
