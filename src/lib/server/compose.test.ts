import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { compose } from './compose.ts';
import { PRESETS } from '../options.ts';

async function pdfWith(pages: number) {
	const d = await PDFDocument.create();
	for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`Strona ${i + 1}`, { x: 72, y: 760 });
	return d.save();
}
const photo = (w: number, h: number) =>
	sharp({ create: { width: w, height: h, channels: 3, background: '#4a90c2' } }).jpeg().toBuffer();

describe('compose', () => {
	it('keeps the chosen pages of a document', async () => {
		const r = await compose({ kind: 'doc', pdf: await pdfWith(5) }, { ...PRESETS.doc, range: '2-4' });
		expect(r.items).toBe(3);
		expect(r.faces).toBe(3);
	});

	it('shrinks pages onto a wider margin', async () => {
		const r = await compose({ kind: 'doc', pdf: await pdfWith(2) }, { ...PRESETS.doc, margin: 20 });
		expect(r.faces).toBe(2);
	});

	it('puts four pages on one sheet', async () => {
		const r = await compose({ kind: 'doc', pdf: await pdfWith(6) }, { ...PRESETS.doc, nup: 4 });
		expect(r.faces).toBe(2);
	});

	it('lays out nine photos on one A4 sheet', async () => {
		const img = await photo(1200, 900);
		const r = await compose({ kind: 'photo', images: Array(9).fill(img) }, { ...PRESETS.photo, nup: 9 });
		expect(r.faces).toBe(1);
		const page = (await PDFDocument.load(r.pdf)).getPage(0);
		expect(Math.round(page.getWidth())).toBe(595);
	});

	it('prints a landscape sheet without turning the photo', async () => {
		const r = await compose({ kind: 'photo', images: [await photo(1600, 1200)] }, { ...PRESETS.photo, orientation: 'landscape' });
		const page = (await PDFDocument.load(r.pdf)).getPage(0);
		expect(page.getWidth()).toBeGreaterThan(page.getHeight());
	});

	it('flags a small photo on a full page as low resolution', async () => {
		const r = await compose({ kind: 'photo', images: [await photo(600, 400)] }, PRESETS.photo);
		expect(r.lowRes).toBe(true);
	});

	it('does not flag a sharp photo', async () => {
		const r = await compose({ kind: 'photo', images: [await photo(3000, 4000)] }, PRESETS.photo);
		expect(r.lowRes).toBe(false);
	});
});
