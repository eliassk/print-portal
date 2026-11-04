import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { toCsv } from '$lib/server/billing';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { ui } from '$lib/i18n';
import { period } from '../period';
import type { RequestHandler } from './$types';

/** Every job in the period as CSV, for invoicing. */
export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!isAdmin(cookies)) error(401);
	const p = period(url);
	const csv = toCsv(getDb().jobsBetween(p.start, p.end), config.timeZone, ui.admin.billing.noCustomer);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="billing-${p.from}-${p.to}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
