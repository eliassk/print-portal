import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { refuse } from '$lib/server/http';
import { connectLink } from '$lib/server/telegram';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** A one-time link that connects the person's Telegram chat to the bot, for their customer when there is one. */
export const POST: RequestHandler = async ({ locals }) => {
	const url = locals.customer ? connectLink(locals.customer.id) : getDb().settings().customersRequired ? null : connectLink(null);
	return url ? json({ url }) : refuse(503, ui.errors.generic);
};
