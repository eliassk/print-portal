import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { isActive, normalizeCode, today } from '$lib/server/customers';
import { getDb } from '$lib/server/db';
import { refuse } from '$lib/server/http';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

const COOKIE = 'customer';
// Slows down guessing codes. Per server, which is enough for one building.
const tries: number[] = [];
const TRY_LIMIT = 20;
const TRY_WINDOW_MS = 10 * 60 * 1000;

/** The customer this browser prints for, if any, and whether one is needed. `code` says whether the person can sign out. */
export const GET: RequestHandler = async ({ locals, cookies }) =>
	json({
		customer: locals.customer && { name: locals.customer.name, code: cookies.get(COOKIE) === locals.customer.code },
		required: getDb().settings().customersRequired
	});

/** Saves a customer code in this browser. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const now = Date.now();
	while (tries.length && tries[0] < now - TRY_WINDOW_MS) tries.shift();
	if (tries.length >= TRY_LIMIT) return refuse(429, ui.errors.rate);
	tries.push(now);
	const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
	const c = getDb().customerByCode(normalizeCode(String(body?.code ?? '')));
	if (!c || !isActive(c, today(config.timeZone, now))) return refuse(403, ui.errors.badCustomerCode);
	cookies.set(COOKIE, c.code, { path: '/', httpOnly: true, sameSite: 'strict', secure: false, maxAge: 60 * 60 * 24 * 365 });
	return json({ customer: { name: c.name, code: true } });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete(COOKIE, { path: '/' });
	return json({ ok: true });
};
