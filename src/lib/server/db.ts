import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import type { Customer } from './customers.ts';

export interface Settings {
	colorAllowed: boolean;
	/** Off: anyone on the network prints without a code, as before customers existed. */
	customersRequired: boolean;
	dailyPages: number;
	maxPages: number;
	/** Telegram chats that may run admin commands in the bot. */
	adminChats: number[];
	/** Who each admin chat belongs to, as Telegram last reported it. Keyed by chat ID. */
	adminNames: Record<string, string>;
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

export interface UsageRow {
	customerId: number | null;
	size: string;
	color: string;
	paper: string;
	jobs: number;
	sheets: number;
	sides: number;
}

export interface BillingJob {
	at: number;
	jobId: string;
	customerId: number | null;
	customer: string | null;
	size: string;
	color: string;
	paper: string;
	duplex: string | null;
	sheets: number;
	/** Printed sides. Jobs from before sides were recorded count one side per sheet. */
	sides: number;
}

type CustomerRow = { id: number; name: string; code: string; enabled: number; active_from: string | null; active_until: string | null; networks: string };
const toCustomer = (r: CustomerRow): Customer => ({
	id: r.id, name: r.name, code: r.code, enabled: !!r.enabled, activeFrom: r.active_from, activeUntil: r.active_until, networks: r.networks
});

const DEFAULTS: Settings = { colorAllowed: true, customersRequired: true, dailyPages: 50, maxPages: 50, adminChats: [], adminNames: {} };

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
	if (!has('jobs', 'sides')) db.exec('ALTER TABLE jobs ADD COLUMN sides INTEGER');
	if (!has('jobs', 'duplex')) db.exec('ALTER TABLE jobs ADD COLUMN duplex TEXT');
	db.exec('CREATE INDEX IF NOT EXISTS jobs_customer_at ON jobs (customer_id, at)');
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
		addJob(j: JobRow & { device: string; customerId?: number; sides?: number; duplex?: string }) {
			db.prepare('INSERT INTO jobs (at, job_id, device, sheets, size, paper, color, expires, customer_id, sides, duplex) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
				j.at, j.jobId, j.device, j.sheets, j.size, j.paper, j.color, j.expires, j.customerId ?? null, j.sides ?? null, j.duplex ?? null
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
		/** Lets this Telegram chat send files, for a customer when there is one. Renews an earlier authorization. */
		authorizeChat(chat: number, customer: number | null, now: number) {
			db.prepare(`INSERT INTO telegram_chats (chat_id, authorized_at, customer_id) VALUES (?, ?, ?)
				ON CONFLICT(chat_id) DO UPDATE SET authorized_at = excluded.authorized_at, customer_id = excluded.customer_id`).run(chat, now, customer);
		},
		/** The customer this chat was connected for, when authorized since `since`. Chats from before customers have none. */
		chatCustomer(chat: number, since: number): number | null {
			const r = db.prepare('SELECT customer_id FROM telegram_chats WHERE chat_id = ? AND authorized_at >= ?').get(chat, since) as { customer_id: number | null } | undefined;
			return r?.customer_id ?? null;
		},
		chatAuthorizedSince(chat: number, since: number): boolean {
			return !!db.prepare('SELECT 1 FROM telegram_chats WHERE chat_id = ? AND authorized_at >= ?').get(chat, since);
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
		/** Totals per customer, size, colour and paper for jobs sent in [from, to). */
		usage(from: number, to: number): UsageRow[] {
			return (
				db.prepare(`SELECT customer_id, size, color, paper, COUNT(*) AS jobs, SUM(sheets) AS sheets, SUM(COALESCE(sides, sheets)) AS sides
					FROM jobs WHERE at >= ? AND at < ? GROUP BY customer_id, size, color, paper ORDER BY customer_id, size, color, paper`).all(from, to) as {
					customer_id: number | null; size: string; color: string; paper: string; jobs: number; sheets: number; sides: number;
				}[]
			).map((r) => ({ customerId: r.customer_id, size: r.size, color: r.color, paper: r.paper, jobs: Number(r.jobs), sheets: Number(r.sheets), sides: Number(r.sides) }));
		},
		/** Every job sent in [from, to), oldest first, for the CSV export. */
		jobsBetween(from: number, to: number): BillingJob[] {
			return (
				db.prepare(`SELECT j.at, j.job_id, j.customer_id, c.name AS customer, j.size, j.color, j.paper, j.duplex, j.sheets, COALESCE(j.sides, j.sheets) AS sides
					FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE j.at >= ? AND j.at < ? ORDER BY j.at`).all(from, to) as {
					at: number; job_id: string; customer_id: number | null; customer: string | null; size: string; color: string; paper: string; duplex: string | null; sheets: number; sides: number;
				}[]
			).map((r) => ({ at: r.at, jobId: r.job_id, customerId: r.customer_id, customer: r.customer, size: r.size, color: r.color, paper: r.paper, duplex: r.duplex, sheets: r.sheets, sides: r.sides }));
		},
		/** Drops job rows older than `before`. Customer jobs are billing records and stay until `billedBefore`. */
		prune(before: number, billedBefore = before) {
			db.prepare('DELETE FROM jobs WHERE at < ? AND (customer_id IS NULL OR at < ?)').run(before, billedBefore);
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
