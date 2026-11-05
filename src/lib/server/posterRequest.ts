import { error, redirect, type Cookies } from '@sveltejs/kit';
import { ui } from '$lib/i18n';
import { isAdmin } from './admin.ts';
import { config } from './config.ts';
import { POSTER_SIZES, type PosterSize } from './poster.ts';
import { botInfo } from './telegram.ts';

/** The poster an admin asked for, filled with this portal's address and bot. */
export function posterRequest(size: string, cookies: Cookies) {
	if (!isAdmin(cookies)) redirect(303, '/admin');
	if (!POSTER_SIZES.includes(size as PosterSize)) error(404);
	// A token whose bot has not answered yet still gets the Telegram section.
	const bot = botInfo()?.title ?? (config.telegramToken ? ui.appName : null);
	return { size: size as PosterSize, url: config.portalUrl, bot };
}

export const posterFileName = (size: PosterSize) => `instrukcja-${size}.pdf`;
