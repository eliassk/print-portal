import { json } from '@sveltejs/kit';
import { ui } from '$lib/i18n';
import { normalize, PrintOptions } from '../options.ts';
import type { Composed } from './compose.ts';
import { composeDraft, getDraft, type Draft } from './jobs.ts';

/** A refusal the page shows as it is. */
export const refuse = (status: number, error: string) => json({ error }, { status });

export const expired = () => refuse(404, ui.errors.expiredDraft);

/** A tooManyPages refusal, or null when `items` is within the admin's limit. */
export const pageLimit = (max: number | null) => (max === null ? null : refuse(400, ui.errors.tooManyPages(max)));

/**
 * Reads the print options from the body and builds the PDF for this device's draft.
 * Preview and print both use it, so print sends exactly what the preview showed.
 */
export async function composeRequest(id: string, device: string, request: Request): Promise<{ draft: Draft; o: PrintOptions; composed: Composed } | Response> {
	const parsed = PrintOptions.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return refuse(400, ui.errors.generic);
	const draft = getDraft(id, device);
	if (!draft) return expired();
	const o = normalize(parsed.data, draft.kind);
	try {
		return { draft, o, composed: await composeDraft(draft, o) };
	} catch (e) {
		if (e instanceof RangeError) return refuse(400, ui.errors.rangeInvalid);
		throw e;
	}
}
