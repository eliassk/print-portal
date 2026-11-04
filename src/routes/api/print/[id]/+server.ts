import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { composeRequest, refuse } from '$lib/server/http';
import { dropDraft } from '$lib/server/jobs';
import { checkJob } from '$lib/server/limits';
import { buildSecureJob } from '$lib/server/pjl';
import { sendRaw } from '$lib/server/printer';
import { newId, newPin } from '$lib/server/secret';
import { notifyPrinted } from '$lib/server/telegram';
import { sheetCount, sideCount } from '$lib/options';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const r = await composeRequest(params.id, locals.device, request);
	if (r instanceof Response) return r;
	const { draft, o, composed } = r;

	const db = getDb();
	const now = Date.now();
	const sheets = sheetCount(composed.items, o);
	const refused = checkJob(db, db.settings(), { device: locals.device, sheets, items: composed.items, color: o.color }, now);
	if (refused) {
		const msg =
			refused.reason === 'rate' ? ui.errors.rate
			: refused.reason === 'daily' ? ui.errors.daily(refused.left)
			: refused.reason === 'color' ? ui.errors.colorOff
			: ui.errors.tooManyPages(refused.max);
		return refuse(429, msg);
	}

	const id = newId(db.idsInUse(now));
	const pin = newPin();
	try {
		await sendRaw(config.printerHost, config.printerPort, buildSecureJob({ id, pin, options: o }, composed.pdf));
	} catch (e) {
		console.error('Printer send failed', e);
		return refuse(502, ui.errors.printer);
	}
	const expires = now + config.pinTtlMin * 60 * 1000;
	db.addJob({ at: now, jobId: id, device: locals.device, sheets, size: o.size, paper: o.paper, color: o.color, expires, customerId: locals.customer?.id,
		sides: sideCount(composed.items, o), duplex: o.duplex });
	// Customer jobs are what tenants are billed for, so they stay two years.
	db.prune(now - 90 * DAY_MS, now - 730 * DAY_MS);
	await dropDraft(params.id);
	// The PIN goes to the browser once and, for files from the bot, to the sender's Telegram chat. It is never stored or logged.
	if (draft.chat) void notifyPrinted(draft.chat, { id, pin, expires, name: draft.name, sheets });
	return json({ id, pin, expires, sheets, telegram: !!draft.chat });
};
