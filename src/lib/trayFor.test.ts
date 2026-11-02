import { describe, expect, it } from 'vitest';
import { trayFor } from './trayFor.ts';
import type { PrinterStatus } from './status.ts';

const s: PrinterStatus = {
	online: true,
	lowPaper: true,
	checkedAt: 0,
	toner: [],
	trays: [
		{ key: 'bypass', size: 'A5', level: 0, state: 'empty' },
		{ key: 'tray1', size: 'A4', level: 100, state: 'full' },
		{ key: 'tray2', size: 'A3', level: 10, state: 'low' },
		{ key: 'tray3', size: 'A4', level: 2, state: 'low' }
	]
};

describe('trayFor', () => {
	it('picks the fullest A4 cassette', () => expect(trayFor({ paper: 'plain', size: 'A4' }, s)?.key).toBe('tray1'));
	it('picks the A3 cassette', () => expect(trayFor({ paper: 'plain', size: 'A3' }, s)?.key).toBe('tray2'));
	it('sends thick paper to the bypass tray', () => expect(trayFor({ paper: 'thick2', size: 'A4' }, s)?.key).toBe('bypass'));
	it('knows nothing without status', () => expect(trayFor({ paper: 'plain', size: 'A4' }, null)).toBeNull());
});
