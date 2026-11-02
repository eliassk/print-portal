import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Settings {
	colorAllowed: boolean;
	dailyPages: number;
	maxPages: number;
}

export interface JobRow {
	at: number;
	jobId: string;
	sheets: number;
	size: string;
	paper: string;
	color: string;
	expires: number;
}

const DEFAULTS: Settings = { colorAllowed: true, dailyPages: 50, maxPages: 50 };

/**
 * Jobs, daily counters and settings. File names and PINs are never stored.
 * Pass ':memory:' in tests.
 */
export function openDb(dir: string | ':memory:') {
	let path = ':memory:';
	if (dir !== ':memory:') {
		mkdirSync(dir, { recursive: true });
		path = join(dir, 'portal.db');
	}
	const db = new DatabaseSync(path);
	db.exec(`
		CREATE TABLE IF NOT EXISTS jobs (
			at INTEGER NOT NULL, job_id TEXT NOT NULL, device TEXT NOT NULL, sheets INTEGER NOT NULL,
			size TEXT NOT NULL, paper TEXT NOT NULL, color TEXT NOT NULL, expires INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS jobs_device_at ON jobs (device, at);
		CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`);

	return {
		settings(): Settings {
			const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
			const s: Settings = { ...DEFAULTS };
			for (const r of rows) if (r.key in s) (s as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
			return s;
		},
		saveSettings(s: Settings) {
			const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
			for (const [k, v] of Object.entries(s)) put.run(k, JSON.stringify(v));
		},
		addJob(j: JobRow & { device: string }) {
			db.prepare('INSERT INTO jobs (at, job_id, device, sheets, size, paper, color, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
				j.at, j.jobId, j.device, j.sheets, j.size, j.paper, j.color, j.expires
			);
		},
		/** Sheets this device printed since `since`. */
		sheetsSince(device: string, since: number): number {
			const r = db.prepare('SELECT COALESCE(SUM(sheets), 0) AS n FROM jobs WHERE device = ? AND at >= ?').get(device, since) as { n: number };
			return Number(r.n);
		},
		jobsSince(device: string, since: number): number {
			const r = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE device = ? AND at >= ?').get(device, since) as { n: number };
			return Number(r.n);
		},
		/** IDs of jobs that may still wait on the printer. */
		idsInUse(now: number): Set<string> {
			const rows = db.prepare('SELECT job_id FROM jobs WHERE expires > ?').all(now) as { job_id: string }[];
			return new Set(rows.map((r) => r.job_id));
		},
		recent(limit = 30): JobRow[] {
			return (
				db.prepare('SELECT at, job_id, sheets, size, paper, color, expires FROM jobs ORDER BY at DESC LIMIT ?').all(limit) as {
					at: number; job_id: string; sheets: number; size: string; paper: string; color: string; expires: number;
				}[]
			).map((r) => ({ at: r.at, jobId: r.job_id, sheets: r.sheets, size: r.size, paper: r.paper, color: r.color, expires: r.expires }));
		},
		totals(since: number): { jobs: number; sheets: number } {
			const r = db.prepare('SELECT COUNT(*) AS jobs, COALESCE(SUM(sheets), 0) AS sheets FROM jobs WHERE at >= ?').get(since) as { jobs: number; sheets: number };
			return { jobs: Number(r.jobs), sheets: Number(r.sheets) };
		},
		/** Drops job rows older than `before`, so the table stays small. */
		prune(before: number) {
			db.prepare('DELETE FROM jobs WHERE at < ?').run(before);
		}
	};
}
export type Db = ReturnType<typeof openDb>;
