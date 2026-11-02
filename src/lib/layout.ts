/** Page geometry in PDF points (1 pt = 1/72 inch). */
export const MM = 72 / 25.4;
/** The printer reports a 5 mm unprintable edge on every side (IPP media-*-margin = 500). */
export const MARGIN_MM = 5;
const GAP_MM = 3;

const SIZES = { A4: [210, 297], A3: [297, 420] } as const;

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Sheet {
	width: number;
	height: number;
	cells: Rect[];
}

/**
 * Splits a sheet into `nup` cells inside the printable area. By default 2-up turns the
 * sheet to landscape so two portrait pages sit side by side; 1, 4 and 9 keep it portrait.
 * Cells are filled left to right, top to bottom.
 */
export function sheetLayout(size: keyof typeof SIZES, nup: 1 | 2 | 4 | 9, orient?: 'portrait' | 'landscape', marginMm = MARGIN_MM): Sheet {
	let [w, h] = SIZES[size].map((v) => v * MM);
	const landscape = (orient ?? (nup === 2 ? 'landscape' : 'portrait')) === 'landscape';
	if (landscape) [w, h] = [h, w];
	// Two cells sit side by side on a landscape sheet and stacked on a portrait one.
	const [cols, rows] = nup === 1 ? [1, 1] : nup === 2 ? (landscape ? [2, 1] : [1, 2]) : nup === 4 ? [2, 2] : [3, 3];
	const m = Math.max(MARGIN_MM, marginMm) * MM;
	const gap = nup === 1 ? 0 : GAP_MM * MM;
	const cw = (w - 2 * m - gap * (cols - 1)) / cols;
	const ch = (h - 2 * m - gap * (rows - 1)) / rows;
	const cells: Rect[] = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) cells.push({ x: m + c * (cw + gap), y: h - m - (r + 1) * ch - r * gap, w: cw, h: ch });
	return { width: w, height: h, cells };
}

/** Places a box of `w`×`h` inside `cell`: whole and centred ("fit") or covering it ("fill"). */
export function place(w: number, h: number, cell: Rect, mode: 'fit' | 'fill'): Rect {
	const s = mode === 'fit' ? Math.min(cell.w / w, cell.h / h) : Math.max(cell.w / w, cell.h / h);
	const pw = w * s;
	const ph = h * s;
	return { x: cell.x + (cell.w - pw) / 2, y: cell.y + (cell.h - ph) / 2, w: pw, h: ph };
}

/** Print resolution of an image of `px` pixels across `pt` points. */
export const dpi = (px: number, pt: number) => (px / pt) * 72;
export const LOW_DPI = 150;
