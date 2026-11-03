import { json } from '@sveltejs/kit';
import { connectLink } from '$lib/server/telegram';
import { pl } from '$lib/i18n/pl';
import type { RequestHandler } from './$types';

/** A one-time link that connects the person's Telegram chat to the bot. */
export const POST: RequestHandler = async () => {
	const url = connectLink();
	return url ? json({ url }) : json({ error: pl.errors.generic }, { status: 503 });
};
