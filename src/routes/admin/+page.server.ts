import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { passwordMatches, signAdmin, verifyAdmin } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { isActive, newCode, normalizeCode, parseDay, parseNetworks, today, type Customer } from '$lib/server/customers';
import { startOfDay } from '$lib/server/limits';
import { printerStatus } from '$lib/server/status';
import { ui } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

const COOKIE = 'admin';
const enabled = () => config.adminPassword.length > 0 && config.adminSecret.length >= 32;

/** Why a customer can or cannot print today. */
function customerState(c: Customer, day: string): 'active' | 'off' | 'upcoming' | 'ended' {
	if (isActive(c, day)) return 'active';
	if (!c.enabled) return 'off';
	return c.activeFrom && day < c.activeFrom ? 'upcoming' : 'ended';
}

/** A customer from an add or edit form. The error key is shown next to the form. */
function readCustomer(f: FormData): Omit<Customer, 'id'> | { error: string } {
	const name = String(f.get('name') ?? '').trim().slice(0, 100);
	if (!name) return { error: ui.admin.nameMissing };
	const code = normalizeCode(String(f.get('code') ?? '')).slice(0, 32) || newCode();
	return {
		name,
		code,
		enabled: f.get('enabled') === 'on',
		activeFrom: parseDay(f.get('activeFrom')),
		activeUntil: parseDay(f.get('activeUntil')),
		networks: parseNetworks(String(f.get('networks') ?? '')).join('\n')
	};
}

/** Saves a customer, or fails when the code is taken. */
function store(save: () => void) {
	try {
		save();
		return { customerSaved: true };
	} catch (e) {
		if (String(e).includes('UNIQUE')) return fail(400, { customerError: ui.admin.codeTaken });
		throw e;
	}
}

export const load: PageServerLoad = async ({ cookies }) => {
	if (!enabled()) return { state: 'disabled' as const };
	if (!verifyAdmin(config.adminSecret, cookies.get(COOKIE))) return { state: 'login' as const };
	const db = getDb();
	const now = Date.now();
	return {
		state: 'in' as const,
		now,
		status: await printerStatus(config.printerHost, config.printerIppPort),
		settings: db.settings(),
		today: db.totals(startOfDay(now)),
		recent: db.recent(30),
		customers: db.customers().map((c) => ({ ...c, state: customerState(c, today(config.timeZone, now)) }))
	};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		if (!enabled()) return fail(403);
		const password = String((await request.formData()).get('password') ?? '');
		if (!passwordMatches(password, config.adminPassword)) return fail(401, { error: ui.admin.wrongPassword });
		cookies.set(COOKIE, signAdmin(config.adminSecret), { path: '/admin', httpOnly: true, sameSite: 'strict', secure: false, maxAge: 12 * 3600 });
		redirect(303, '/admin');
	},
	logout: async ({ cookies }) => {
		cookies.delete(COOKIE, { path: '/admin' });
		redirect(303, '/admin');
	},
	save: async ({ request, cookies }) => {
		if (!enabled() || !verifyAdmin(config.adminSecret, cookies.get(COOKIE))) return fail(401);
		const f = await request.formData();
		const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(f.get(k)) || min)));
		getDb().saveSettings({ colorAllowed: f.get('colorAllowed') === 'on', dailyPages: n('dailyPages', 1, 1000), maxPages: n('maxPages', 1, 500) });
		return { saved: true };
	},
	addCustomer: async ({ request, cookies }) => {
		if (!enabled() || !verifyAdmin(config.adminSecret, cookies.get(COOKIE))) return fail(401);
		const c = readCustomer(await request.formData());
		if ('error' in c) return fail(400, { customerError: c.error });
		return store(() => getDb().addCustomer(c));
	},
	updateCustomer: async ({ request, cookies }) => {
		if (!enabled() || !verifyAdmin(config.adminSecret, cookies.get(COOKIE))) return fail(401);
		const f = await request.formData();
		const c = readCustomer(f);
		if ('error' in c) return fail(400, { customerError: c.error });
		return store(() => getDb().updateCustomer({ ...c, id: Number(f.get('id')) }));
	},
	deleteCustomer: async ({ request, cookies }) => {
		if (!enabled() || !verifyAdmin(config.adminSecret, cookies.get(COOKIE))) return fail(401);
		getDb().deleteCustomer(Number((await request.formData()).get('id')));
		return { customerSaved: true };
	}
};
