import type { Db, Settings } from './db.ts';

export const RATE_JOBS = 5;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

/** Local midnight, so the daily limit resets overnight for the building. */
export function startOfDay(now: number): number {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export type Refusal = { reason: 'rate' } | { reason: 'daily'; left: number } | { reason: 'color' } | { reason: 'pages'; max: number };

/** Checks a job before it is sent. Returns null when it may go. */
export function checkJob(db: Db, s: Settings, device: string, sheets: number, items: number, color: string, now: number): Refusal | null {
	if (color === 'color' && !s.colorAllowed) return { reason: 'color' };
	if (items > s.maxPages) return { reason: 'pages', max: s.maxPages };
	if (db.jobsSince(device, now - RATE_WINDOW_MS) >= RATE_JOBS) return { reason: 'rate' };
	const used = db.sheetsSince(device, startOfDay(now));
	if (used + sheets > s.dailyPages) return { reason: 'daily', left: Math.max(0, s.dailyPages - used) };
	return null;
}
