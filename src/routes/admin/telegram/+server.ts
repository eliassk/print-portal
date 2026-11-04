import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { refuse } from '$lib/server/http';
import { ADMIN_LINK_TTL_H, adminConnectLink } from '$lib/server/telegram';
import { ui } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** A one-time link that makes the chat it is opened in an admin chat. */
export const POST: RequestHandler = async ({ cookies }) => {
	if (!isAdmin(cookies)) return refuse(401, ui.errors.generic);
	const url = adminConnectLink();
	return url ? json({ url, hours: ADMIN_LINK_TTL_H }) : refuse(503, ui.admin.botOff);
};
