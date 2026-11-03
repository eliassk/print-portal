import type { Handle, ServerInit } from '@sveltejs/kit';
import { lang } from '$lib/i18n';
import { newDeviceId } from '$lib/server/auth';
import { startBot } from '$lib/server/telegram';

export const init: ServerInit = () => startBot();

/** Gives each browser a random device id, so daily limits count per phone. */
export const handle: Handle = async ({ event, resolve }) => {
	let device = event.cookies.get('device');
	if (!device || !/^[\w-]{16,32}$/.test(device)) {
		device = newDeviceId();
		event.cookies.set('device', device, { path: '/', httpOnly: true, sameSite: 'strict',
			// The portal runs over plain HTTP on the LAN, so a Secure cookie would never be sent back.
			secure: false, maxAge: 60 * 60 * 24 * 365 });
	}
	event.locals.device = device;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', lang) });
};
