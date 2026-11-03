import { json } from '@sveltejs/kit';
import { connectLink } from '$lib/server/telegram';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** A one-time link that connects the person's Telegram chat to the bot. */
export const POST: RequestHandler = async () => {
	const url = connectLink();
	return url ? json({ url }) : json({ error: ui.errors.generic }, { status: 503 });
};
