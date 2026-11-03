import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import { composeRequest } from '$lib/server/http';
import { renderPage } from '$lib/server/tools';
import { sheetCount } from '$lib/options';
import type { RequestHandler } from './$types';

/** Renders a sheet of the exact PDF that print would send. */
export const POST: RequestHandler = async ({ params, request, url, locals }) => {
	const r = await composeRequest(params.id, locals.device, request);
	if (r instanceof Response) return r;
	const { o, composed } = r;
	const page = Math.min(Math.max(1, Number(url.searchParams.get('sheet') ?? 1)), composed.faces);
	let png = await renderPage(composed.pdf, page);
	if (o.color === 'mono') png = new Uint8Array(await sharp(png).grayscale().png().toBuffer());
	return json({
		image: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
		faces: composed.faces,
		items: composed.items,
		sheets: sheetCount(composed.items, o),
		lowRes: composed.lowRes,
		options: o
	});
};
