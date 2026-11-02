import { describe, expect, it } from 'vitest';
import { parseRange } from './pages.ts';
import { sheetCount } from './options.ts';

describe('parseRange', () => {
	it('treats empty as all pages', () => expect(parseRange(' ', 3)).toEqual([1, 2, 3]));
	it('reads lists and ranges, with an en dash too', () =>
		expect(parseRange('5, 1-3, 2–3', 6)).toEqual([1, 2, 3, 5]));
	it('rejects pages past the end', () => expect(parseRange('2-9', 4)).toBeNull());
	it('rejects text', () => expect(parseRange('abc', 4)).toBeNull());
	it('rejects reversed ranges', () => expect(parseRange('3-1', 4)).toBeNull());
});

describe('sheetCount', () => {
	it('halves for duplex, rounding up', () => expect(sheetCount(5, { copies: 2, duplex: 'long', nup: 1 })).toBe(6));
	it('counts every page single-sided', () => expect(sheetCount(5, { copies: 1, duplex: 'off', nup: 1 })).toBe(5));
});
