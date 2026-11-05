import { posterFileName, posterRequest } from '$lib/server/posterRequest';
import { posterPdf } from '$lib/server/poster';
import { refuse } from '$lib/server/http';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** The guide as a PDF file to save. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const { size, ...o } = posterRequest(params.size, cookies);
	const pdf = await posterPdf(size, o);
	if (!pdf) return refuse(503, ui.admin.posters.noPdf);
	return new Response(pdf as BodyInit, {
		headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${posterFileName(size)}"`, 'cache-control': 'no-store' }
	});
};
