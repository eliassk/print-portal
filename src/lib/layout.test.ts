import { describe, expect, it } from 'vitest';
import { MM, dpi, place, sheetLayout } from './layout.ts';
import { normalize, PRESETS, sheetCount } from './options.ts';

describe('sheetLayout', () => {
	it('keeps a 5 mm edge on A4', () => {
		const s = sheetLayout('A4', 1);
		expect(s.cells[0].x).toBeCloseTo(5 * MM);
		expect(s.cells[0].w).toBeCloseTo(200 * MM);
		expect(s.cells[0].h).toBeCloseTo(287 * MM);
	});
	it('lays out A5 with the same 5 mm edge', () => {
		const s = sheetLayout('A5', 1);
		expect(s.width).toBeCloseTo(148 * MM);
		expect(s.cells[0].w).toBeCloseTo(138 * MM);
	});
	it('turns 2-up to landscape with two cells side by side', () => {
		const s = sheetLayout('A4', 2);
		expect(s.width).toBeGreaterThan(s.height);
		expect(s.cells).toHaveLength(2);
		expect(s.cells[1].x).toBeGreaterThan(s.cells[0].x);
	});
	it('widens the edge to the chosen margin', () => {
		const s = sheetLayout('A4', 1, undefined, 15);
		expect(s.cells[0].x).toBeCloseTo(15 * MM);
		expect(s.cells[0].w).toBeCloseTo(180 * MM);
	});
	it('never goes below the printer edge', () => expect(sheetLayout('A4', 1, undefined, 0).cells[0].x).toBeCloseTo(5 * MM));
	it('stacks 2-up on a portrait sheet', () => {
		const s = sheetLayout('A4', 2, 'portrait');
		expect(s.height).toBeGreaterThan(s.width);
		expect(s.cells[0].y).toBeGreaterThan(s.cells[1].y);
	});
	it('turns a single photo sheet to landscape when asked', () => {
		const s = sheetLayout('A4', 1, 'landscape');
		expect(s.width).toBeGreaterThan(s.height);
	});
	it('fills 9-up top row first', () => {
		const s = sheetLayout('A4', 9);
		expect(s.cells).toHaveLength(9);
		expect(s.cells[0].y).toBeGreaterThan(s.cells[3].y);
	});
});

describe('place', () => {
	const cell = { x: 0, y: 0, w: 100, h: 100 };
	it('fits a wide image with bars top and bottom', () => expect(place(200, 100, cell, 'fit')).toEqual({ x: 0, y: 25, w: 100, h: 50 }));
	it('fills by overflowing the cell', () => expect(place(200, 100, cell, 'fill')).toEqual({ x: -50, y: 0, w: 200, h: 100 }));
});

describe('print rules', () => {
	it('computes dpi', () => expect(dpi(1500, 720)).toBe(150));
	it('drops duplex for thick paper', () =>
		expect(normalize({ ...PRESETS.doc, paper: 'thick2' }, 'doc').duplex).toBe('off'));
	it('drops 9-up for documents', () => expect(normalize({ ...PRESETS.doc, nup: 9 }, 'doc').nup).toBe(1));
	it('ignores page range for photos', () => expect(normalize({ ...PRESETS.photo, range: '1' }, 'photo').range).toBe(''));
	it('counts sheets with n-up and duplex', () => expect(sheetCount(9, { copies: 1, duplex: 'long', nup: 2 })).toBe(3));
});
