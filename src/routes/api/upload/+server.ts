import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { pageLimit, refuse } from '$lib/server/http';
import { intake } from '$lib/server/intake';
import { saveDraft } from '$lib/server/jobs';
import { overPageLimit } from '$lib/server/limits';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const files = form.getAll('file').filter((f): f is File => f instanceof File);
	if (files.length > config.maxPhotos) return refuse(400, ui.errors.tooManyPhotos(config.maxPhotos));
	if (files.reduce((n, f) => n + f.size, 0) > config.maxUploadBytes) return refuse(413, ui.errors.tooBig);
	const result = await intake(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
	if (!result.ok) return refuse(400, ui.errors[result.error]);
	const tooMany = pageLimit(overPageLimit(getDb().settings(), result.items));
	if (tooMany) return tooMany;
	const draft = await saveDraft(result, { device: locals.device });
	const sheets = result.workbook && { list: result.workbook.book.sheets, pick: result.workbook.pick };
	return json({ draft, kind: result.kind, items: result.items, sheets });
};
