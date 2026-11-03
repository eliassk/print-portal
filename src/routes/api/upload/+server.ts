import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { intake } from '$lib/server/intake';
import { saveDraft } from '$lib/server/jobs';
import { getDb } from '$lib/server/app';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (files.length > config.maxPhotos) return json({ error: ui.errors.tooManyPhotos(config.maxPhotos) }, { status: 400 });
	if (files.reduce((n, f) => n + f.size, 0) > config.maxUploadBytes) return json({ error: ui.errors.tooBig }, { status: 413 });
	const result = await intake(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
	if (!result.ok) return json({ error: ui.errors[result.error] }, { status: 400 });
	const max = getDb().settings().maxPages;
	if (result.items > max) return json({ error: ui.errors.tooManyPages(max) }, { status: 400 });
	const draft = await saveDraft(result.kind, result.data, result.items, locals.device, result.workbook);
	const sheets = result.workbook && { list: result.workbook.book.sheets, pick: result.workbook.pick };
	return json({ draft, kind: result.kind, items: result.items, sheets });
};
