import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.ts';
import { compose, type Composed, type Source } from './compose.ts';
import type { Kind, PrintOptions } from '../options.ts';
import type { Workbook } from './intake.ts';

/** What intake produced: the files to keep and what they hold. */
type Intake = { kind: Kind; data: Uint8Array[]; items: number; workbook?: Workbook };
import type { Book, SheetPick } from './workbook.ts';

export interface Draft {
	kind: Kind;
	files: string[];
	/** Pages for a document, photos for photos. */
	items: number;
	device: string;
	created: number;
	/** Files are deleted from disk at this time. */
	expires: number;
	/** Original file name, shown on the page. */
	name: string;
	/** Set while a draft from the Telegram bot waits for a browser to open its link. */
	claim?: string;
	/** Telegram chat that sent the file. It gets the ID and PIN once the job is printed. */
	chat?: number;
	/** Set for spreadsheets. files[0] is the PDF of the current pick. */
	sheets?: { file: string; book: Book; pick: SheetPick };
	/** Last composed result, so print sends exactly what the preview showed. */
	cache?: { key: string; result: Composed };
}

// Drafts live in memory and on disk for 30 minutes. A restart loses unsent drafts only.
const drafts = new Map<string, Draft>();
const DRAFT_TTL_MS = 30 * 60 * 1000;
/** Files sent to the Telegram bot wait longer, since the person still has to reach the building Wi-Fi. */
export const BOT_DRAFT_TTL_MIN = 60;

// Expired files MUST leave the disk on time, even when nobody uploads anything new.
setInterval(() => void sweep(), 60_000).unref();

const dir = () => join(config.dataDir, 'uploads');

export async function saveDraft(
	{ kind, data, items, workbook }: Intake,
	{ device, name = '', ttlMs = DRAFT_TTL_MS }: { device: string; name?: string; ttlMs?: number }
): Promise<string> {
	await sweep();
	await mkdir(dir(), { recursive: true });
	const key = randomUUID();
	const files: string[] = [];
	for (const [i, d] of data.entries()) {
		const f = join(dir(), `${key}-${i}`);
		await writeFile(f, d);
		files.push(f);
	}
	let sheets: Draft['sheets'];
	if (workbook) {
		const file = join(dir(), `${key}-book`);
		await writeFile(file, workbook.xlsx);
		sheets = { file, book: workbook.book, pick: workbook.pick };
	}
	const created = Date.now();
	drafts.set(key, { kind, files, items, device, created, expires: created + ttlMs, sheets, name });
	return key;
}

/**
 * A draft no browser owns yet. The returned token MUST reach only the sender.
 * The first browser that opens it becomes the owner.
 */
export async function saveClaimable(file: Intake, name: string, chat?: number): Promise<string> {
	const key = await saveDraft(file, { device: '', name, ttlMs: BOT_DRAFT_TTL_MIN * 60 * 1000 });
	const claim = randomBytes(18).toString('base64url');
	const d = drafts.get(key)!;
	d.claim = claim;
	d.chat = chat;
	return claim;
}

/** Hands a waiting draft to this device. Works once. */
export function claimDraft(claim: string, device: string): { key: string; draft: Draft } | null {
	for (const [key, d] of drafts) {
		if (!d.claim || d.claim !== claim || Date.now() > d.expires) continue;
		d.claim = undefined;
		d.device = device;
		return { key, draft: d };
	}
	return null;
}

/** The draft, if it exists and belongs to this device. */
export function getDraft(key: string, device: string): Draft | null {
	const d = drafts.get(key);
	return d && d.device && d.device === device && Date.now() <= d.expires ? d : null;
}

export async function composeDraft(d: Draft, o: PrintOptions): Promise<Composed> {
	const key = JSON.stringify(o);
	if (d.cache?.key === key) return d.cache.result;
	const data = await Promise.all(d.files.map((f) => readFile(f)));
	const src: Source = d.kind === 'doc' ? { kind: 'doc', pdf: data[0] } : { kind: 'photo', images: data };
	const result = await compose(src, o);
	d.cache = { key, result };
	return result;
}

export const readBookFile = (d: Draft) => readFile(d.sheets!.file);

/** Swaps in the PDF of a new sheet pick. */
export async function repick(d: Draft, pick: SheetPick, pdf: Uint8Array, pages: number) {
	await writeFile(d.files[0], pdf);
	d.items = pages;
	d.sheets!.pick = pick;
	d.cache = undefined;
}

export async function dropDraft(key: string) {
	const d = drafts.get(key);
	drafts.delete(key);
	if (d) await Promise.all([...d.files, ...(d.sheets ? [d.sheets.file] : [])].map((f) => rm(f, { force: true })));
}

async function sweep() {
	const now = Date.now();
	for (const [k, d] of drafts) if (now > d.expires) await dropDraft(k);
}
