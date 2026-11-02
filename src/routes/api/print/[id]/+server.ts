import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/app';
import { config } from '$lib/server/config';
import { composeDraft, dropDraft, getDraft } from '$lib/server/jobs';
import { checkJob } from '$lib/server/limits';
import { buildSecureJob } from '$lib/server/pjl';
import { sendRaw } from '$lib/server/printer';
import { newId, newPin } from '$lib/server/secret';
import { normalize, PrintOptions, sheetCount } from '$lib/options';
import { pl } from '$lib/i18n/pl';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const parsed = PrintOptions.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: pl.errors.generic }, { status: 400 });
	const draft = getDraft(params.id, locals.device);
	if (!draft) return json({ error: pl.errors.expiredDraft }, { status: 404 });
	const o = normalize(parsed.data, draft.kind);
	let composed;
	try {
		composed = await composeDraft(draft, o);
	} catch (e) {
		if (e instanceof RangeError) return json({ error: pl.errors.rangeInvalid }, { status: 400 });
		throw e;
	}

	const db = getDb();
	const now = Date.now();
	const sheets = sheetCount(composed.items, o);
	const refused = checkJob(db, db.settings(), locals.device, sheets, composed.items, o.color, now);
	if (refused) {
		const msg =
			refused.reason === 'rate' ? pl.errors.rate
			: refused.reason === 'daily' ? pl.errors.daily(refused.left)
			: refused.reason === 'color' ? pl.errors.colorOff
			: pl.errors.tooManyPages(refused.max);
		return json({ error: msg }, { status: 429 });
	}

	const id = newId(db.idsInUse(now));
	const pin = newPin();
	try {
		await sendRaw(config.printerHost, config.printerPort, buildSecureJob({ id, pin, options: o }, composed.pdf));
	} catch (e) {
		console.error('Printer send failed', e);
		return json({ error: pl.errors.printer }, { status: 502 });
	}
	const expires = now + config.pinTtlMin * 60 * 1000;
	db.addJob({ at: now, jobId: id, device: locals.device, sheets, size: o.size, paper: o.paper, color: o.color, expires });
	db.prune(now - 90 * 24 * 60 * 60 * 1000);
	await dropDraft(params.id);
	// The PIN goes to the browser once and is never stored or logged.
	return json({ id, pin, expires, sheets });
};
