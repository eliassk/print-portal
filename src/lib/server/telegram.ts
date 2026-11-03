import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { dateLocale, ui } from '$lib/i18n';
import { getDb } from './app.ts';
import { config } from './config.ts';
import { intake } from './intake.ts';
import { BOT_DRAFT_TTL_MIN, saveClaimable } from './jobs.ts';

// Overridable only for local tests against a fake Telegram server.
const API = env.TELEGRAM_API ?? 'https://api.telegram.org';
/** The Bot API refuses downloads above this size. */
export const TELEGRAM_MAX_BYTES = 20 * 1024 * 1024;
const RATE_FILES = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const LINK_TTL_MS = 10 * 60 * 1000;
const MAX_LINKS = 1000;
/** A chat stays authorized this long after connecting or after its last print. */
export const AUTH_DAYS = 90;
const AUTH_MS = AUTH_DAYS * 24 * 60 * 60 * 1000;

// Tokens handed out on the portal, waiting for "/start <token>" in the bot chat.
const links = new Map<string, number>();
let botName = '';

/** Whether the portal can offer the connect button. */
export const botReady = () => !!botName;

/**
 * A one-time t.me link that authorizes the chat it is opened in.
 * Only the portal hands these out, so only people on the building network can get one.
 */
export function connectLink(now = Date.now()): string | null {
	if (!botName) return null;
	for (const [t, exp] of links) if (exp < now) links.delete(t);
	if (links.size >= MAX_LINKS) return null;
	const token = randomBytes(18).toString('base64url');
	links.set(token, now + LINK_TTL_MS);
	return `https://t.me/${botName}?start=${token}`;
}

/** Uses up a connect token. True when it was valid. */
export function useLink(token: string, now = Date.now()): boolean {
	const exp = links.get(token);
	links.delete(token);
	return exp !== undefined && exp >= now;
}

export const isAuthorized = (chat: number, now = Date.now()) => getDb().chatAuthorizedSince(chat, now - AUTH_MS);

type TgFile = { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
type Message = { chat: { id: number }; text?: string; document?: TgFile; photo?: TgFile[] };
type Update = { update_id: number; message?: Message };

const recent = new Map<number, number[]>();

/** True when this chat may send one more file now. */
export function allowFile(chat: number, now: number): boolean {
	const times = (recent.get(chat) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
	if (times.length >= RATE_FILES) {
		recent.set(chat, times);
		return false;
	}
	recent.set(chat, [...times, now]);
	return true;
}

/** The file to print: a document as sent, or the largest size of a photo. */
export function pickFile(m: Message): (TgFile & { file_name: string }) | null {
	if (m.document) return { ...m.document, file_name: m.document.file_name ?? ui.bot.unnamedFile };
	const photo = m.photo?.at(-1);
	return photo ? { ...photo, file_name: ui.bot.unnamedPhoto } : null;
}

async function call<T>(token: string, method: string, body: object, signal?: AbortSignal): Promise<T> {
	const res = await fetch(`${API}/bot${token}/${method}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal
	});
	const data = (await res.json()) as { ok: boolean; result: T; description?: string };
	if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
	return data.result;
}

const reply = (token: string, chat: number, text: string) =>
	call(token, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true } }).catch((e) => console.error(e));

async function handle(token: string, m: Message) {
	const chat = m.chat.id;
	const start = m.text?.match(/^\/start(?:@\w+)?\s+([\w-]{10,64})$/);
	if (start) {
		if (!useLink(start[1])) return reply(token, chat, ui.bot.linkGone(config.portalUrl));
		getDb().authorizeChat(chat, Date.now());
		return reply(token, chat, ui.bot.connected(AUTH_DAYS, BOT_DRAFT_TTL_MIN));
	}
	if (/^\/stop\b/.test(m.text ?? '')) {
		getDb().forgetChat(chat);
		return reply(token, chat, ui.bot.stopped);
	}
	// Unknown chats get nothing downloaded or saved.
	if (!isAuthorized(chat)) return reply(token, chat, ui.bot.notConnected(config.portalUrl));
	const file = pickFile(m);
	if (!file) return reply(token, chat, ui.bot.hello);
	if (!allowFile(chat, Date.now())) return reply(token, chat, ui.bot.rate);
	if ((file.file_size ?? 0) > Math.min(TELEGRAM_MAX_BYTES, config.maxUploadBytes)) return reply(token, chat, ui.bot.tooBig);

	const info = await call<{ file_path?: string }>(token, 'getFile', { file_id: file.file_id });
	if (!info.file_path) return reply(token, chat, ui.bot.tooBig);
	const res = await fetch(`${API}/file/bot${token}/${info.file_path}`);
	if (!res.ok) throw new Error(`Telegram download: ${res.status}`);
	const data = new Uint8Array(await res.arrayBuffer());

	const result = await intake([{ name: file.file_name, data }]);
	if (!result.ok) return reply(token, chat, ui.errors[result.error]);
	const max = getDb().settings().maxPages;
	if (result.items > max) return reply(token, chat, ui.errors.tooManyPages(max));
	const claim = await saveClaimable(result.kind, result.data, result.items, result.workbook, file.file_name, chat);
	return reply(token, chat, ui.bot.ready(file.file_name, `${config.portalUrl.replace(/\/$/, '')}/?d=${claim}`, BOT_DRAFT_TTL_MIN));
}

/**
 * Sends the release codes to the chat that sent the file, so the person can forward
 * them to whoever picks the print up. The PIN is not kept anywhere else.
 */
export async function notifyPrinted(chat: number, job: { id: string; pin: string; expires: number; name: string; sheets: number }) {
	if (!config.telegramToken) return;
	getDb().renewChat(chat, Date.now());
	const until = new Date(job.expires).toLocaleTimeString(dateLocale, { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit' });
	await reply(config.telegramToken, chat, ui.bot.printed({ ...job, until }));
}

let running = false;

/**
 * Long-polls Telegram for files and answers each with a one-time portal link.
 * Only outbound HTTPS is used, so the portal stays LAN-only. Off without a token.
 */
export function startBot() {
	const token = config.telegramToken;
	if (!token || running) return;
	running = true;
	void (async () => {
		let offset = 0;
		while (!botName) {
			try {
				botName = (await call<{ username: string }>(token, 'getMe', {})).username;
			} catch (e) {
				console.error(e);
				await new Promise((r) => setTimeout(r, 5000));
			}
		}
		console.log(`Telegram bot @${botName} started`);
		for (;;) {
			try {
				const updates = await call<Update[]>(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, AbortSignal.timeout(60_000));
				for (const u of updates) {
					offset = u.update_id + 1;
					if (!u.message) continue;
					await handle(token, u.message).catch((e) => {
						console.error(e);
						return reply(token, u.message!.chat.id, ui.errors.generic);
					});
				}
			} catch (e) {
				console.error(e);
				await new Promise((r) => setTimeout(r, 5000));
			}
		}
	})();
}
