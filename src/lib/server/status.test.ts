import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseResponse } from './ipp.ts';
import { toStatus } from './status.ts';

// Recorded from the bizhub C224e on 2026-11-02.
const fixture = readFileSync(new URL('./fixtures/c224e-status.ipp', import.meta.url));

describe('printer status from a real C224e response', () => {
	const { status, attrs } = parseResponse(fixture);
	const s = toStatus(attrs, 0);

	it('parses a successful response', () => expect(status).toBe(0));

	it('reads every tray with size and level', () => {
		expect(s.trays).toEqual([
			{ key: 'bypass', size: 'A5', level: 0, state: 'empty' },
			{ key: 'tray1', size: 'A4', level: 100, state: 'full' },
			{ key: 'tray2', size: 'A3', level: 10, state: 'low' },
			{ key: 'tray3', size: 'A4', level: 2, state: 'low' }
		]);
	});

	it('reads the four toners', () =>
		expect(s.toner).toEqual([
			{ key: 'cyan', level: 48 },
			{ key: 'magenta', level: 74 },
			{ key: 'yellow', level: 73 },
			{ key: 'black', level: 13 }
		]));

	it('reports low paper', () => expect(s.lowPaper).toBe(true));
});
