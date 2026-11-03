import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { printBook } from '$lib/server/intake';
import { expired, pageLimit, refuse } from '$lib/server/http';
import { getDraft, readBookFile, repick } from '$lib/server/jobs';
import { overPageLimit } from '$lib/server/limits';
import { readGrid, SheetPick } from '$lib/server/workbook';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** Cell texts of one sheet of a spreadsheet draft, for the range picker. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const draft = getDraft(params.id, locals.device);
	if (!draft) return expired();
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
	if (!draft) return expired();
	if (!draft.sheets) error(400);
	const parsed = SheetPick.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return refuse(400, ui.errors.sheetPick);
	let result;
	try {
		result = await printBook(await readBookFile(draft), parsed.data);
	} catch (e) {
		if (e instanceof RangeError) return refuse(400, ui.errors.cellRange);
		throw e;
	}
	if (!result.ok) return refuse(400, ui.errors[result.error]);
	const tooMany = pageLimit(overPageLimit(getDb().settings(), result.pages));
	if (tooMany) return tooMany;
	await repick(draft, parsed.data, result.pdf, result.pages);
	return json({ items: result.pages, pick: parsed.data });
};
