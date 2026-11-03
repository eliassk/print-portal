import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { passwordMatches, signAdmin, verifyAdmin } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { startOfDay } from '$lib/server/limits';
import { printerStatus } from '$lib/server/status';
import { ui } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

const COOKIE = 'admin';
const enabled = () => config.adminPassword.length > 0 && config.adminSecret.length >= 32;

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
		recent: db.recent(30)
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
	}
};
