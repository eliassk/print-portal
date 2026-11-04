import type { BillingJob, UsageRow } from './db.ts';

/** Milliseconds the zone is ahead of UTC at `ts`. */
function offsetMs(ts: number, timeZone: string): number {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
			.formatToParts(ts)
			.map((x) => [x.type, x.value])
	);
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}

/** Midnight of a YYYY-MM-DD day in the building's time zone. */
export function dayStart(day: string, timeZone: string): number {
	const utc = Date.parse(`${day}T00:00:00Z`);
	// Twice, so a day that starts right after a DST change still lands on midnight.
	const guess = utc - offsetMs(utc, timeZone);
	return utc - offsetMs(guess, timeZone);
}

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** First and last day of the month that holds `day`, and of the month before. */
export function months(day: string) {
	const first = `${day.slice(0, 7)}-01`;
	const prevLast = addDays(first, -1);
	const nextFirst = addDays(`${day.slice(0, 7)}-28`, 4).slice(0, 7) + '-01';
	return {
		current: { from: first, to: addDays(nextFirst, -1) },
		previous: { from: `${prevLast.slice(0, 7)}-01`, to: prevLast }
	};
}

export interface Totals {
	jobs: number;
	sheets: number;
	sides: number;
}

export interface CustomerUsage {
	customerId: number | null;
	total: Totals;
	mono: Totals;
	color: Totals;
	rows: UsageRow[];
}

const zero = (): Totals => ({ jobs: 0, sheets: 0, sides: 0 });
const add = (t: Totals, r: Totals) => {
	t.jobs += r.jobs;
	t.sheets += r.sheets;
	t.sides += r.sides;
};

/** Groups usage rows per customer, with colour and black-and-white totals. Biggest users first. */
export function summarize(rows: UsageRow[]): CustomerUsage[] {
	const by = new Map<number | null, CustomerUsage>();
	for (const r of rows) {
		let u = by.get(r.customerId);
		if (!u) by.set(r.customerId, (u = { customerId: r.customerId, total: zero(), mono: zero(), color: zero(), rows: [] }));
		u.rows.push(r);
		add(u.total, r);
		add(r.color === 'color' ? u.color : u.mono, r);
	}
	return [...by.values()].sort((a, b) => b.total.sides - a.total.sides);
}

const cell = (v: string | number) => {
	const s = String(v);
	// Quotes values with separators, and defuses formulas a spreadsheet would run.
	const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
	return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** One row per job, semicolon-separated so Excel in Polish opens it in columns. */
export function toCsv(jobs: BillingJob[], timeZone: string, noCustomer: string): string {
	const head = ['date', 'time', 'job_id', 'customer', 'size', 'color', 'paper', 'duplex', 'sheets', 'sides'];
	const lines = jobs.map((j) => {
		const d = new Date(j.at);
		const date = d.toLocaleDateString('sv-SE', { timeZone });
		const time = d.toLocaleTimeString('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit' });
		return [date, time, j.jobId, j.customer ?? noCustomer, j.size, j.color, j.paper, j.duplex ?? '', j.sheets, j.sides].map(cell).join(';');
	});
	// The BOM makes Excel read the file as UTF-8, so Polish letters survive.
	return '﻿' + [head.join(';'), ...lines].join('\r\n') + '\r\n';
}
