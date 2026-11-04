import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import type { Customer } from './customers.ts';

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
	/** Name of the customer who printed, null when deleted since. */
	customer?: string | null;
}

type CustomerRow = { id: number; name: string; code: string; enabled: number; active_from: string | null; active_until: string | null; networks: string };
const toCustomer = (r: CustomerRow): Customer => ({
	id: r.id, name: r.name, code: r.code, enabled: !!r.enabled, activeFrom: r.active_from, activeUntil: r.active_until, networks: r.networks
});

const DEFAULTS: Settings = { colorAllowed: true, dailyPages: 50, maxPages: 50 };

/**
 * Jobs, daily counters, settings, customers and authorized Telegram chats. File names and PINs are never stored.
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
		CREATE TABLE IF NOT EXISTS telegram_chats (chat_id INTEGER PRIMARY KEY, authorized_at INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS customers (
			id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL,
			active_from TEXT, active_until TEXT, networks TEXT NOT NULL DEFAULT ''
		);
	`);
	// Databases from before customers existed get the new columns.
	const has = (table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
	if (!has('jobs', 'customer_id')) db.exec('ALTER TABLE jobs ADD COLUMN customer_id INTEGER');
	if (!has('telegram_chats', 'customer_id')) db.exec('ALTER TABLE telegram_chats ADD COLUMN customer_id INTEGER');

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
		addJob(j: JobRow & { device: string; customerId?: number }) {
			db.prepare('INSERT INTO jobs (at, job_id, device, sheets, size, paper, color, expires, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
				j.at, j.jobId, j.device, j.sheets, j.size, j.paper, j.color, j.expires, j.customerId ?? null
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
				db.prepare(`SELECT j.at, j.job_id, j.sheets, j.size, j.paper, j.color, j.expires, c.name AS customer
					FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id ORDER BY j.at DESC LIMIT ?`).all(limit) as {
					at: number; job_id: string; sheets: number; size: string; paper: string; color: string; expires: number; customer: string | null;
				}[]
			).map((r) => ({ at: r.at, jobId: r.job_id, sheets: r.sheets, size: r.size, paper: r.paper, color: r.color, expires: r.expires, customer: r.customer }));
		},
		totals(since: number): { jobs: number; sheets: number } {
			const r = db.prepare('SELECT COUNT(*) AS jobs, COALESCE(SUM(sheets), 0) AS sheets FROM jobs WHERE at >= ?').get(since) as { jobs: number; sheets: number };
			return { jobs: Number(r.jobs), sheets: Number(r.sheets) };
		},
		/** Lets this Telegram chat send files for a customer. Renews an earlier authorization. */
		authorizeChat(chat: number, customer: number, now: number) {
			db.prepare(`INSERT INTO telegram_chats (chat_id, authorized_at, customer_id) VALUES (?, ?, ?)
				ON CONFLICT(chat_id) DO UPDATE SET authorized_at = excluded.authorized_at, customer_id = excluded.customer_id`).run(chat, now, customer);
		},
		/** The customer this chat was connected for, when authorized since `since`. Chats from before customers have none. */
		chatCustomer(chat: number, since: number): number | null {
			const r = db.prepare('SELECT customer_id FROM telegram_chats WHERE chat_id = ? AND authorized_at >= ?').get(chat, since) as { customer_id: number | null } | undefined;
			return r?.customer_id ?? null;
		},
		/** Restarts the clock for a chat that is still connected. A disconnected chat stays out. */
		renewChat(chat: number, now: number) {
			db.prepare('UPDATE telegram_chats SET authorized_at = ? WHERE chat_id = ?').run(now, chat);
		},
		forgetChat(chat: number) {
			db.prepare('DELETE FROM telegram_chats WHERE chat_id = ?').run(chat);
		},
		customers(): Customer[] {
			return (db.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all() as CustomerRow[]).map(toCustomer);
		},
		customer(id: number): Customer | null {
			const r = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
			return r ? toCustomer(r) : null;
		},
		customerByCode(code: string): Customer | null {
			const r = db.prepare('SELECT * FROM customers WHERE code = ?').get(code) as CustomerRow | undefined;
			return r ? toCustomer(r) : null;
		},
		/** Throws on a code that is already taken. */
		addCustomer(c: Omit<Customer, 'id'>): number {
			const r = db.prepare('INSERT INTO customers (name, code, enabled, active_from, active_until, networks) VALUES (?, ?, ?, ?, ?, ?)').run(
				c.name, c.code, c.enabled ? 1 : 0, c.activeFrom, c.activeUntil, c.networks
			);
			return Number(r.lastInsertRowid);
		},
		/** Throws on a code that is already taken. */
		updateCustomer(c: Customer) {
			db.prepare('UPDATE customers SET name = ?, code = ?, enabled = ?, active_from = ?, active_until = ?, networks = ? WHERE id = ?').run(
				c.name, c.code, c.enabled ? 1 : 0, c.activeFrom, c.activeUntil, c.networks, c.id
			);
		},
		/** Also disconnects the customer's Telegram chats. Past jobs stay, without a name. */
		deleteCustomer(id: number) {
			db.prepare('DELETE FROM telegram_chats WHERE customer_id = ?').run(id);
			db.prepare('DELETE FROM customers WHERE id = ?').run(id);
		},
		/** Drops job rows older than `before`, so the table stays small. */
		prune(before: number) {
			db.prepare('DELETE FROM jobs WHERE at < ?').run(before);
		}
	};
}
export type Db = ReturnType<typeof openDb>;

let db: Db | null = null;

/** The one database for the running server, opened on first use. */
export function getDb(): Db {
	db ??= openDb(config.dataDir);
	return db;
}
