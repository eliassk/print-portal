import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { LOW_DPI, MM, SIZES, dpi, place, sheetLayout, type Rect } from '../layout.ts';
import type { PrintOptions } from '../options.ts';
import { parseRange } from '../pages.ts';

export type Source = { kind: 'doc'; pdf: Uint8Array } | { kind: 'photo'; images: Uint8Array[] };

export interface Composed {
	pdf: Uint8Array;
	/** Pages for documents, photos for photos: what n-up and the sheet count work on. */
	items: number;
	faces: number;
	lowRes: boolean;
}

/** Builds the exact PDF that goes to the printer. The preview renders this same PDF. */
export async function compose(src: Source, o: PrintOptions): Promise<Composed> {
	return src.kind === 'doc' ? composeDoc(src.pdf, o) : composePhotos(src.images, o);
}

async function composeDoc(input: Uint8Array, o: PrintOptions): Promise<Composed> {
	const source = await PDFDocument.load(input);
	const pages = parseRange(o.range, source.getPageCount());
	if (!pages) throw new RangeError('range');
	const out = await PDFDocument.create();
	if (o.nup === 1 && o.margin === 5 && pages.every((n) => fitsSize(source.getPage(n - 1), o.size))) {
		// Pages already on the chosen size at the printer's own edge: copy them untouched.
		for (const p of await out.copyPages(source, pages.map((n) => n - 1))) out.addPage(p);
	} else {
		for (let i = 0; i < pages.length; i += o.nup) {
			const first = source.getPage(pages[i] - 1);
			const wide = o.nup === 1 && first.getWidth() > first.getHeight();
			const sheet = sheetLayout(o.size, o.nup, wide ? 'landscape' : undefined, o.margin);
			const page = out.addPage([sheet.width, sheet.height]);
			for (const [j, cell] of sheet.cells.entries()) {
				const n = pages[i + j];
				if (n === undefined) break;
				// pdf-lib cannot embed a page without content; a blank page stays blank.
				const e = await out.embedPage(source.getPage(n - 1)).catch(() => null);
				if (!e) continue;
				const r = place(e.width, e.height, cell, 'fit');
				page.drawPage(e, { x: r.x, y: r.y, width: r.w, height: r.h });
			}
		}
	}
	return { pdf: await out.save(), items: pages.length, faces: out.getPageCount(), lowRes: false };
}

/** True when a page is the chosen paper size in either orientation, within 2%. */
function fitsSize(page: { getWidth(): number; getHeight(): number }, size: PrintOptions['size']): boolean {
	const [a, b] = [page.getWidth(), page.getHeight()].sort((x, y) => x - y);
	const [w, h] = SIZES[size].map((v) => v * MM);
	return Math.abs(a - w) / w < 0.02 && Math.abs(b - h) / h < 0.02;
}

async function composePhotos(images: Uint8Array[], o: PrintOptions): Promise<Composed> {
	const out = await PDFDocument.create();
	let lowRes = false;
	for (let i = 0; i < images.length; i += o.nup) {
		const sheet = sheetLayout(o.size, o.nup, o.orientation === 'auto' ? undefined : o.orientation, o.margin);
		const page = out.addPage([sheet.width, sheet.height]);
		for (const [j, cell] of sheet.cells.entries()) {
			const img = images[i + j];
			if (!img) break;
			const prepared = await preparePhoto(img, cell, o);
			lowRes ||= prepared.dpi < LOW_DPI;
			const jpg = await out.embedJpg(prepared.jpeg);
			const r = place(prepared.width, prepared.height, cell, 'fit');
			page.drawImage(jpg, { x: r.x, y: r.y, width: r.w, height: r.h });
		}
	}
	return { pdf: await out.save(), items: images.length, faces: out.getPageCount(), lowRes };
}

/** Applies EXIF rotation, turns the photo to match the cell, crops for "fill", flattens to JPEG. */
async function preparePhoto(input: Uint8Array, cell: Rect, o: PrintOptions) {
	const upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
	let { width, height } = upright.info;
	let img = sharp(upright.data);
	if (o.orientation === 'auto' && width > height !== cell.w > cell.h && width !== height) {
		img = img.rotate(90);
		[width, height] = [height, width];
	}
	if (o.fit === 'fill') {
		const scale = Math.min(width / cell.w, height / cell.h);
		width = Math.round(cell.w * scale);
		height = Math.round(cell.h * scale);
		img = img.resize(width, height, { fit: 'cover' });
	}
	if (o.color === 'mono') img = img.grayscale();
	const jpeg = await img.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
	const placed = place(width, height, cell, 'fit');
	return { jpeg, width, height, dpi: dpi(width, placed.w) };
}
