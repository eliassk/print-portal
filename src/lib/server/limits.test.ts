import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { checkJob, startOfDay } from './limits.ts';

const now = new Date(2026, 10, 2, 14, 0).getTime();
const s = { colorAllowed: true, dailyPages: 10, maxPages: 50, adminChats: [], adminNames: {} };
const job = (db: ReturnType<typeof openDb>, at: number, sheets: number, device = 'a') =>
	db.addJob({ at, jobId: String(1000 + at % 9000), device, sheets, size: 'A4', paper: 'plain', color: 'mono', expires: at + 3600_000 });

describe('checkJob', () => {
	it('lets a first job through', () => expect(checkJob(openDb(':memory:'), s, { device: 'a', sheets: 3, items: 3, color: 'mono' }, now)).toBeNull());

	it('stops at the daily sheet limit and says how many are left', () => {
		const db = openDb(':memory:');
		job(db, startOfDay(now) + 1000, 8);
		expect(checkJob(db, s, { device: 'a', sheets: 3, items: 3, color: 'mono' }, now)).toEqual({ reason: 'daily', left: 2 });
	});

	it('does not count yesterday or other devices', () => {
		const db = openDb(':memory:');
		job(db, startOfDay(now) - 1000, 9);
		job(db, now - 1000, 9, 'b');
		expect(checkJob(db, s, { device: 'a', sheets: 3, items: 3, color: 'mono' }, now)).toBeNull();
	});

	it('limits five jobs per ten minutes', () => {
		const db = openDb(':memory:');
		for (let i = 0; i < 5; i++) job(db, now - 60_000 * (i + 1), 0);
		expect(checkJob(db, s, { device: 'a', sheets: 1, items: 1, color: 'mono' }, now)).toEqual({ reason: 'rate' });
	});

	it('refuses colour when switched off', () =>
		expect(checkJob(openDb(':memory:'), { ...s, colorAllowed: false }, { device: 'a', sheets: 1, items: 1, color: 'color' }, now)).toEqual({ reason: 'color' }));
});

describe('settings', () => {
	it('round-trips', () => {
		const db = openDb(':memory:');
		db.saveSettings({ colorAllowed: false, dailyPages: 20, maxPages: 30, adminChats: [42, -100], adminNames: { 42: 'Ola @ola' } });
		expect(db.settings()).toEqual({ colorAllowed: false, dailyPages: 20, maxPages: 30, adminChats: [42, -100], adminNames: { 42: 'Ola @ola' } });
	});
});
