import type { Handle, ServerInit } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { lang, ui } from '$lib/i18n';
import { newDeviceId } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { resolveCustomer, today } from '$lib/server/customers';
import { getDb } from '$lib/server/db';
import { removeOrphans } from '$lib/server/jobs';
import { startBot } from '$lib/server/telegram';

/** Endpoints that work before a customer is known. */
const OPEN_API = new Set(['/api/customer', '/api/printer']);

export const init: ServerInit = async () => {
	// Files of drafts from before a restart can no longer be opened or printed, so they go.
	const n = await removeOrphans();
	if (n) console.log(`Removed ${n} upload files left from before the restart`);
	startBot();
};

/**
 * Gives each browser a random device id, so daily limits count per phone,
 * and refuses portal calls from people without an active customer.
 */
export const handle: Handle = async ({ event, resolve }) => {
	let device = event.cookies.get('device');
	if (!device || !/^[\w-]{16,32}$/.test(device)) {
		device = newDeviceId();
		event.cookies.set('device', device, { path: '/', httpOnly: true, sameSite: 'strict',
			// The portal runs over plain HTTP on the LAN, so a Secure cookie would never be sent back.
			secure: false, maxAge: 60 * 60 * 24 * 365 });
	}
	event.locals.device = device;
	event.locals.customer = resolveCustomer(getDb().customers(), event.cookies.get('customer'), event.getClientAddress(), today(config.timeZone));
	const path = event.url.pathname;
	if (path.startsWith('/api/') && !OPEN_API.has(path) && !event.locals.customer) return json({ error: ui.errors.noCustomer }, { status: 401 });
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', lang) });
};
