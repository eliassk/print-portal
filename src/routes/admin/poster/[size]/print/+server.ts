import { json } from '@sveltejs/kit';
import { posterFileName, posterRequest } from '$lib/server/posterRequest';
import { posterPdf } from '$lib/server/poster';
import { refuse } from '$lib/server/http';
import { intake } from '$lib/server/intake';
import { saveClaimable } from '$lib/server/jobs';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** Loads the guide into the print portal, like a file sent to the bot, and returns the link that opens it. */
export const POST: RequestHandler = async ({ params, cookies }) => {
	const { size, ...o } = posterRequest(params.size, cookies);
	const pdf = await posterPdf(size, o);
	if (!pdf) return refuse(503, ui.admin.posters.noPdf);
	const name = posterFileName(size);
	const file = await intake([{ name, data: pdf }]);
	if (!file.ok) return refuse(500, ui.errors.generic);
	return json({ url: `/?d=${await saveClaimable(file, name, undefined, size === 'a3' ? 'A3' : 'A4')}` });
};
