import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { dateLocale, ui } from '$lib/i18n';
import { adminCommand } from './botAdmin.ts';
import { isActive, today } from './customers.ts';
import { getDb } from './db.ts';
import { config } from './config.ts';
import { intake } from './intake.ts';
import { BOT_DRAFT_TTL_MIN, saveClaimable } from './jobs.ts';
import { overPageLimit } from './limits.ts';

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
const links = new Map<string, { exp: number; customer: number }>();
let botName = '';
/** The name people see in Telegram, e.g. "Drukarka Biuro". */
let botTitle = '';

/** Whether the portal can offer the connect button. */
export const botReady = () => !!botName;

/** The running bot, or null when there is no token or it has not started yet. */
export const botInfo = () => (botName ? { username: botName, title: botTitle || botName } : null);

/**
 * A one-time t.me link that authorizes the chat it is opened in for this customer.
 * Only the portal hands these out, so only people with an active customer code can get one.
 */
export function connectLink(customer: number, now = Date.now()): string | null {
	if (!botName) return null;
	for (const [t, l] of links) if (l.exp < now) links.delete(t);
	if (links.size >= MAX_LINKS) return null;
	const token = randomBytes(18).toString('base64url');
	links.set(token, { exp: now + LINK_TTL_MS, customer });
	return `https://t.me/${botName}?start=${token}`;
}

// One-time tokens from the admin panel that make the opening chat an admin chat.
const adminLinks = new Map<string, number>();
/** Admin links are often sent to someone else, so they last a day. */
export const ADMIN_LINK_TTL_H = 24;

/** A one-time t.me link that adds the chat it is opened in to the admin chats. */
export function adminConnectLink(now = Date.now()): string | null {
	if (!botName) return null;
	for (const [t, exp] of adminLinks) if (exp < now) adminLinks.delete(t);
	const token = `a${randomBytes(18).toString('base64url')}`;
	if (adminLinks.size >= MAX_LINKS) return null;
	adminLinks.set(token, now + ADMIN_LINK_TTL_H * 60 * 60 * 1000);
	return `https://t.me/${botName}?start=${token}`;
}

/** Uses up an admin connect token. True when it was valid. */
function useAdminLink(token: string, now = Date.now()): boolean {
	const exp = adminLinks.get(token);
	adminLinks.delete(token);
	return exp !== undefined && exp >= now;
}

/** Uses up a connect token. Returns its customer when it was valid. */
export function useLink(token: string, now = Date.now()): number | null {
	const l = links.get(token);
	links.delete(token);
	return l && l.exp >= now ? l.customer : null;
}

/** A chat may send files while it is connected and its customer is active. */
export function isAuthorized(chat: number, now = Date.now()): boolean {
	const db = getDb();
	const id = db.chatCustomer(chat, now - AUTH_MS);
	const c = id === null ? null : db.customer(id);
	return !!c && isActive(c, today(config.timeZone, now));
}

type TgFile = { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
type Person = { first_name?: string; last_name?: string; username?: string };
type Message = { chat: { id: number; title?: string } & Person; from?: Person; text?: string; document?: TgFile; photo?: TgFile[] };

/** A readable name for a chat: the group title, or the person's name and @username. */
export function chatName(c: { title?: string } & Person): string {
	if (c.title) return c.title;
	const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
	return [name, c.username && `@${c.username}`].filter(Boolean).join(' ') || '';
}

/** Adds an admin chat, or refreshes the name of one that is already there. */
export function rememberAdmin(chat: number, name: string, add = false) {
	const db = getDb();
	const s = db.settings();
	const known = s.adminChats.includes(chat);
	if (!known && !add) return;
	if (known && (!name || s.adminNames[chat] === name)) return;
	db.saveSettings({
		...s,
		adminChats: known ? s.adminChats : [...s.adminChats, chat],
		adminNames: name ? { ...s.adminNames, [chat]: name } : s.adminNames
	});
}

/** Asks Telegram who a chat belongs to. Works once the person has written to the bot. */
export async function lookupChat(chat: number): Promise<string> {
	if (!config.telegramToken) return '';
	try {
		return chatName(await call<{ title?: string } & Person>(config.telegramToken, 'getChat', { chat_id: chat }, AbortSignal.timeout(5000)));
	} catch {
		return '';
	}
}
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
		if (adminLinks.has(start[1])) {
			if (!useAdminLink(start[1])) return reply(token, chat, ui.bot.linkGone(config.portalUrl));
			rememberAdmin(chat, chatName(m.chat), true);
			return reply(token, chat, `${ui.bot.admin.connected}\n\n${ui.bot.admin.help}`);
		}
		const customer = useLink(start[1]);
		if (customer === null) return reply(token, chat, ui.bot.linkGone(config.portalUrl));
		getDb().authorizeChat(chat, customer, Date.now());
		return reply(token, chat, ui.bot.connected(AUTH_DAYS, BOT_DRAFT_TTL_MIN));
	}
	if (/^\/stop\b/.test(m.text ?? '')) {
		getDb().forgetChat(chat);
		return reply(token, chat, ui.bot.stopped);
	}
	if (/^\/id\b/.test(m.text ?? '')) return reply(token, chat, ui.bot.chatId(chat));
	if (getDb().settings().adminChats.includes(chat)) rememberAdmin(chat, chatName(m.chat));
	if (m.text && getDb().settings().adminChats.includes(chat)) {
		const r = adminCommand(m.text, getDb(), config.timeZone);
		if (r) return 'text' in r ? reply(token, chat, r.text) : sendDocument(token, chat, r.document, r.caption);
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
	const max = overPageLimit(getDb().settings(), result.items);
	if (max !== null) return reply(token, chat, ui.errors.tooManyPages(max));
	const claim = await saveClaimable(result, file.file_name, chat);
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

/** Sends a text file, such as the billing CSV, as a Telegram document. */
async function sendDocument(token: string, chat: number, doc: { name: string; data: string }, caption: string) {
	const form = new FormData();
	form.append('chat_id', String(chat));
	form.append('caption', caption);
	form.append('document', new Blob([doc.data], { type: 'text/csv' }), doc.name);
	const res = await fetch(`${API}/bot${token}/sendDocument`, { method: 'POST', body: form });
	const data = (await res.json()) as { ok: boolean; description?: string };
	if (!data.ok) throw new Error(`Telegram sendDocument: ${data.description ?? res.status}`);
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
				const me = await call<{ username: string; first_name: string }>(token, 'getMe', {});
				botTitle = me.first_name;
				botName = me.username;
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
