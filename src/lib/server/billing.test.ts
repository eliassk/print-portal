import { describe, expect, it } from 'vitest';
import { dayStart, months, summarize, toCsv } from './billing.ts';
import { openDb } from './db.ts';
import { sideCount } from '../options.ts';

const TZ = 'Europe/Warsaw';

describe('periods', () => {
	it('starts a day at local midnight, in winter and summer', () => {
		expect(new Date(dayStart('2026-11-04', TZ)).toISOString()).toBe('2026-11-03T23:00:00.000Z');
		expect(new Date(dayStart('2026-07-01', TZ)).toISOString()).toBe('2026-06-30T22:00:00.000Z');
	});
	it('handles the day clocks go back', () => expect(new Date(dayStart('2026-10-25', TZ)).toISOString()).toBe('2026-10-24T22:00:00.000Z'));
	it('finds this and last month', () => {
		expect(months('2026-11-04')).toEqual({ current: { from: '2026-11-01', to: '2026-11-30' }, previous: { from: '2026-10-01', to: '2026-10-31' } });
		expect(months('2026-01-15').previous).toEqual({ from: '2025-12-01', to: '2025-12-31' });
		expect(months('2028-02-10').current.to).toBe('2028-02-29');
	});
});

describe('usage', () => {
	const job = (db: ReturnType<typeof openDb>, at: number, customerId: number | undefined, color: string, sheets: number, sides: number) =>
		db.addJob({ at, jobId: String(at), device: 'd', sheets, sides, size: 'A4', paper: 'plain', color, expires: at, customerId, duplex: 'long' });

	it('counts sides: pages per sheet and copies', () => {
		expect(sideCount(5, { copies: 2, nup: 1 })).toBe(10);
		expect(sideCount(5, { copies: 1, nup: 2 })).toBe(3);
	});

	it('sums per customer and colour inside the period only', () => {
		const db = openDb(':memory:');
		job(db, 100, 1, 'mono', 2, 4);
		job(db, 200, 1, 'color', 1, 1);
		job(db, 300, 2, 'mono', 6, 6);
		job(db, 900, 1, 'mono', 9, 9);
		const [a, b] = summarize(db.usage(0, 500));
		expect(b).toMatchObject({ customerId: 1, total: { jobs: 2, sheets: 3, sides: 5 }, mono: { sides: 4 }, color: { sides: 1 } });
		expect(a).toMatchObject({ customerId: 2, total: { sides: 6 } });
	});

	it('keeps customer jobs longer than anonymous ones', () => {
		const db = openDb(':memory:');
		job(db, 100, 1, 'mono', 1, 1);
		job(db, 100, undefined, 'mono', 1, 1);
		db.prune(500, 50);
		expect(db.usage(0, 1000).map((r) => r.customerId)).toEqual([1]);
	});
});

describe('toCsv', () => {
	it('writes one row per job in local time, with safe cells', () => {
		const csv = toCsv(
			[{ at: Date.UTC(2026, 10, 3, 23, 30), jobId: '1234', customerId: 1, customer: '=Firma; "A"', size: 'A4', color: 'mono', paper: 'plain', duplex: 'long', sheets: 1, sides: 2 }],
			TZ,
			'none'
		);
		expect(csv.split('\r\n')[1]).toBe(`2026-11-04;00:30;1234;"'=Firma; ""A""";A4;mono;plain;long;1;2`);
	});
});
