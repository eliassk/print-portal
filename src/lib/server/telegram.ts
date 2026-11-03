import { env } from '$env/dynamic/private';
import { pl } from '../i18n/pl.ts';
import { getDb } from './app.ts';
import { config } from './config.ts';
import { intake } from './intake.ts';
import { saveClaimable } from './jobs.ts';

// Overridable only for local tests against a fake Telegram server.
const API = env.TELEGRAM_API ?? 'https://api.telegram.org';
/** The Bot API refuses downloads above this size. */
export const TELEGRAM_MAX_BYTES = 20 * 1024 * 1024;
const RATE_FILES = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

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
	if (m.document) return { ...m.document, file_name: m.document.file_name ?? 'plik' };
	const photo = m.photo?.at(-1);
	return photo ? { ...photo, file_name: 'zdjecie.jpg' } : null;
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
	const file = pickFile(m);
	if (!file) return reply(token, chat, pl.bot.hello(config.portalUrl));
	if (!allowFile(chat, Date.now())) return reply(token, chat, pl.bot.rate);
	if ((file.file_size ?? 0) > Math.min(TELEGRAM_MAX_BYTES, config.maxUploadBytes)) return reply(token, chat, pl.bot.tooBig);

	const info = await call<{ file_path?: string }>(token, 'getFile', { file_id: file.file_id });
	if (!info.file_path) return reply(token, chat, pl.bot.tooBig);
	const res = await fetch(`${API}/file/bot${token}/${info.file_path}`);
	if (!res.ok) throw new Error(`Telegram download: ${res.status}`);
	const data = new Uint8Array(await res.arrayBuffer());

	const result = await intake([{ name: file.file_name, data }]);
	if (!result.ok) return reply(token, chat, pl.errors[result.error]);
	const max = getDb().settings().maxPages;
	if (result.items > max) return reply(token, chat, pl.errors.tooManyPages(max));
	const claim = await saveClaimable(result.kind, result.data, result.items, result.workbook, file.file_name);
	return reply(token, chat, pl.bot.ready(file.file_name, `${config.portalUrl.replace(/\/$/, '')}/?d=${claim}`));
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
		console.log('Telegram bot started');
		for (;;) {
			try {
				const updates = await call<Update[]>(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, AbortSignal.timeout(60_000));
				for (const u of updates) {
					offset = u.update_id + 1;
					if (!u.message) continue;
					await handle(token, u.message).catch((e) => {
						console.error(e);
						return reply(token, u.message!.chat.id, pl.errors.generic);
					});
				}
			} catch (e) {
				console.error(e);
				await new Promise((r) => setTimeout(r, 5000));
			}
		}
	})();
}
