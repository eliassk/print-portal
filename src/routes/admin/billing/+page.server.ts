import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { summarize } from '$lib/server/billing';
import { getDb } from '$lib/server/db';
import { period } from './period';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	if (!isAdmin(cookies)) redirect(303, '/admin');
	const db = getDb();
	const p = period(url);
	const usage = summarize(db.usage(p.start, p.end));
	const names = new Map(db.customers().map((c) => [c.id, c.name]));
	// Customers with nothing printed are listed too, so a missing bill is easy to spot.
	const idle = [...names.keys()].filter((id) => !usage.some((u) => u.customerId === id));
	return { from: p.from, to: p.to, months: p.months, usage, idle, names: Object.fromEntries(names) };
};
