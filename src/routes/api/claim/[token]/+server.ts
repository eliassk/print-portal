import { json } from '@sveltejs/kit';
import { claimDraft } from '$lib/server/jobs';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** Opens a file sent to the Telegram bot in this browser. */
export const POST: RequestHandler = async ({ params, locals }) => {
	const claimed = claimDraft(params.token, locals.device);
	if (!claimed) return json({ error: ui.errors.claimGone }, { status: 404 });
	const { key, draft } = claimed;
	const sheets = draft.sheets && { list: draft.sheets.book.sheets, pick: draft.sheets.pick };
	return json({ draft: key, kind: draft.kind, items: draft.items, sheets, name: draft.name });
};
