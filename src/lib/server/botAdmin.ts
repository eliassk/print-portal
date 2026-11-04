import { dateLocale, ui } from '$lib/i18n';
import { addDays, dayStart, months, summarize, toCsv } from './billing.ts';
import { isActive, newCode, normalizeCode, today, type Customer } from './customers.ts';
import type { Db } from './db.ts';

export type AdminReply = { text: string } | { document: { name: string; data: string }; caption: string };

// Polish and English names for each command.
const COMMANDS: Record<string, string> = {
	klienci: 'customers', customers: 'customers',
	dodaj: 'add', add: 'add',
	wylacz: 'off', off: 'off',
	wlacz: 'on', on: 'on',
	statystyki: 'stats', stats: 'stats',
	csv: 'csv',
	pomoc: 'help', help: 'help', start: 'help'
};

const t = () => ui.bot.admin;
const day = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });

function period(from: string | null, until: string | null) {
	const p = ui.admin.period;
	if (from && until) return p.range(day(from), day(until));
	if (from) return p.from(day(from));
	if (until) return p.until(day(until));
	return p.always;
}

/** The month from "last", "YYYY-MM" or nothing (this month). Null when the argument is not one of those. */
function month(arg: string, todayDay: string) {
	const m = months(todayDay);
	if (!arg) return m.current;
	if (/^(poprzedni|last|prev)$/i.test(arg)) return m.previous;
	if (/^\d{4}-(0[1-9]|1[0-2])$/.test(arg)) return months(`${arg}-01`).current;
	return null;
}

const monthName = (from: string) => new Date(`${from}T12:00`).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

/** Saves a new customer with a fresh code. A taken code is retried, since codes are random. */
function addCustomer(db: Db, c: Omit<Customer, 'id' | 'code'>): string {
	for (let i = 0; ; i++) {
		const code = newCode();
		try {
			db.addCustomer({ ...c, code });
			return code;
		} catch (e) {
			if (i >= 5 || !String(e).includes('UNIQUE')) throw e;
		}
	}
}

/**
 * Runs an admin command from a Telegram chat on the admin list.
 * Returns null when the text is not an admin command, so the normal bot flow handles it.
 */
export function adminCommand(text: string, db: Db, timeZone: string, now = Date.now()): AdminReply | null {
	const m = text.trim().match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
	const cmd = m && COMMANDS[m[1].toLowerCase()];
	if (!cmd) return null;
	const arg = (m[2] ?? '').trim();
	const todayDay = today(timeZone, now);

	switch (cmd) {
		case 'help':
			return { text: t().help };

		case 'customers': {
			const all = db.customers();
			if (!all.length) return { text: t().noCustomers };
			const lines = all.map((c) => {
				const state = isActive(c, todayDay) ? ui.admin.states.active : c.enabled ? ui.admin.states.ended : ui.admin.states.off;
				return `${c.name}\n${c.code} · ${state} · ${period(c.activeFrom, c.activeUntil)}`;
			});
			return { text: lines.join('\n\n') };
		}

		case 'add': {
			// Trailing dates: one is the end, two are start and end.
			const dates = arg.match(/(\d{4}-\d{2}-\d{2})/g) ?? [];
			const name = arg.replace(/\s*\d{4}-\d{2}-\d{2}/g, '').trim().slice(0, 100);
			if (!name || dates.length > 2) return { text: t().addUsage };
			const [activeFrom, activeUntil] = dates.length === 2 ? dates : [null, dates[0] ?? null];
			const code = addCustomer(db, { name, enabled: true, activeFrom, activeUntil, networks: '' });
			return { text: t().added(name, code, period(activeFrom, activeUntil)) };
		}

		case 'on':
		case 'off': {
			const c = db.customerByCode(normalizeCode(arg));
			if (!c) return { text: t().unknownCode(arg) };
			db.updateCustomer({ ...c, enabled: cmd === 'on' });
			return { text: t().switched(c.name, cmd === 'on') };
		}

		case 'stats':
		case 'csv': {
			const p = month(arg, todayDay);
			if (!p) return { text: t().badMonth };
			const start = dayStart(p.from, timeZone);
			const end = dayStart(addDays(p.to, 1), timeZone);
			const label = monthName(p.from);
			if (cmd === 'csv') {
				const data = toCsv(db.jobsBetween(start, end), timeZone, ui.admin.billing.noCustomer);
				return { document: { name: `billing-${p.from.slice(0, 7)}.csv`, data }, caption: t().csvCaption(label) };
			}
			const usage = summarize(db.usage(start, end));
			if (!usage.length) return { text: `${t().stats(label)}\n\n${t().statsEmpty}` };
			const names = new Map(db.customers().map((c) => [c.id, c.name]));
			const sum = { sides: 0, color: 0, mono: 0 };
			const lines = usage.map((u) => {
				sum.sides += u.total.sides;
				sum.color += u.color.sides;
				sum.mono += u.mono.sides;
				const name = u.customerId === null ? ui.admin.billing.noCustomer : (names.get(u.customerId) ?? '—');
				return t().statsLine(name, u.total.sides, u.color.sides, u.mono.sides, u.total.sheets, u.total.jobs);
			});
			return { text: [t().stats(label), '', ...lines, '', t().statsTotal(sum.sides, sum.color, sum.mono)].join('\n') };
		}
	}
	return null;
}
