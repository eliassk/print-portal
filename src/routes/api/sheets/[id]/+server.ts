import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/app';
import { printBook } from '$lib/server/intake';
import { getDraft, readBookFile, repick } from '$lib/server/jobs';
import { readGrid, SheetPick } from '$lib/server/workbook';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** Cell texts of one sheet of a spreadsheet draft, for the range picker. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const draft = getDraft(params.id, locals.device);
	if (!draft) return json({ error: ui.errors.expiredDraft }, { status: 404 });
	if (!draft.sheets) error(400);
	try {
		return json(readGrid(await readBookFile(draft), url.searchParams.get('name') ?? ''));
	} catch (e) {
		if (e instanceof RangeError) error(404);
		throw e;
	}
};

/** Re-renders a spreadsheet draft with other sheets or ranges. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const draft = getDraft(params.id, locals.device);
	if (!draft) return json({ error: ui.errors.expiredDraft }, { status: 404 });
	if (!draft.sheets) error(400);
	const parsed = SheetPick.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: ui.errors.sheetPick }, { status: 400 });
	let result;
	try {
		result = await printBook(await readBookFile(draft), parsed.data);
	} catch (e) {
		if (e instanceof RangeError) return json({ error: ui.errors.cellRange }, { status: 400 });
		throw e;
	}
	if (!result.ok) return json({ error: ui.errors[result.error] }, { status: 400 });
	const max = getDb().settings().maxPages;
	if (result.pages > max) return json({ error: ui.errors.tooManyPages(max) }, { status: 400 });
	await repick(draft, parsed.data, result.pdf, result.pages);
	return json({ items: result.pages, pick: parsed.data });
};
