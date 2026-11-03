import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.ts';
import { compose, type Composed, type Source } from './compose.ts';
import type { Kind, PrintOptions } from '../options.ts';
import type { Workbook } from './intake.ts';
import type { Book, SheetPick } from './workbook.ts';

interface Draft {
	kind: Kind;
	files: string[];
	/** Pages for a document, photos for photos. */
	items: number;
	device: string;
	created: number;
	/** Original file name, shown on the page. */
	name: string;
	/** Set while a draft from the Telegram bot waits for a browser to open its link. */
	claim?: string;
	/** Set for spreadsheets. files[0] is the PDF of the current pick. */
	sheets?: { file: string; book: Book; pick: SheetPick };
	/** Last composed result, so print sends exactly what the preview showed. */
	cache?: { key: string; result: Composed };
}

// Drafts live in memory and on disk for 30 minutes. A restart loses unsent drafts only.
const drafts = new Map<string, Draft>();
const DRAFT_TTL_MS = 30 * 60 * 1000;

const dir = () => join(config.dataDir, 'uploads');

export async function saveDraft(kind: Kind, data: Uint8Array[], items: number, device: string, workbook?: Workbook, name = ''): Promise<string> {
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
	drafts.set(key, { kind, files, items, device, created: Date.now(), sheets, name });
	return key;
}

/**
 * A draft no browser owns yet. The returned token MUST reach only the sender.
 * The first browser that opens it becomes the owner.
 */
export async function saveClaimable(kind: Kind, data: Uint8Array[], items: number, workbook: Workbook | undefined, name: string): Promise<string> {
	const key = await saveDraft(kind, data, items, '', workbook, name);
	const claim = randomBytes(18).toString('base64url');
	drafts.get(key)!.claim = claim;
	return claim;
}

/** Hands a waiting draft to this device. Works once. */
export function claimDraft(claim: string, device: string): { key: string; draft: Draft } | null {
	for (const [key, d] of drafts) {
		if (!d.claim || d.claim !== claim || Date.now() - d.created > DRAFT_TTL_MS) continue;
		d.claim = undefined;
		d.device = device;
		return { key, draft: d };
	}
	return null;
}

/** The draft, if it exists and belongs to this device. */
export function getDraft(key: string, device: string): Draft | null {
	const d = drafts.get(key);
	return d && d.device && d.device === device ? d : null;
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
	for (const [k, d] of drafts) if (now - d.created > DRAFT_TTL_MS) await dropDraft(k);
}
