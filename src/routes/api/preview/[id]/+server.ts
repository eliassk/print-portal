import { error, json } from '@sveltejs/kit';
import sharp from 'sharp';
import { composeDraft, getDraft } from '$lib/server/jobs';
import { renderPage } from '$lib/server/tools';
import { normalize, PrintOptions, sheetCount } from '$lib/options';
import { pl } from '$lib/i18n/pl';
import type { RequestHandler } from './$types';

/** Renders a sheet of the exact PDF that print would send. */
export const POST: RequestHandler = async ({ params, request, url, locals }) => {
	const draft = getDraft(params.id, locals.device);
	if (!draft) return json({ error: pl.errors.expiredDraft }, { status: 404 });
	const parsed = PrintOptions.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400);
	const o = normalize(parsed.data, draft.kind);
	let composed;
	try {
		composed = await composeDraft(draft, o);
	} catch (e) {
		if (e instanceof RangeError) return json({ error: pl.errors.rangeInvalid }, { status: 400 });
		throw e;
	}
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
