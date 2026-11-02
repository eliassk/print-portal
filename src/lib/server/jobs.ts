import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.ts';
import { compose, type Composed, type Source } from './compose.ts';
import type { Kind, PrintOptions } from '../options.ts';

interface Draft {
	kind: Kind;
	files: string[];
	/** Pages for a document, photos for photos. */
	items: number;
	device: string;
	created: number;
	/** Last composed result, so print sends exactly what the preview showed. */
	cache?: { key: string; result: Composed };
}

// Drafts live in memory and on disk for 30 minutes. A restart loses unsent drafts only.
const drafts = new Map<string, Draft>();
const DRAFT_TTL_MS = 30 * 60 * 1000;

const dir = () => join(config.dataDir, 'uploads');

export async function saveDraft(kind: Kind, data: Uint8Array[], items: number, device: string): Promise<string> {
	await sweep();
	await mkdir(dir(), { recursive: true });
	const key = randomUUID();
	const files: string[] = [];
	for (const [i, d] of data.entries()) {
		const f = join(dir(), `${key}-${i}`);
		await writeFile(f, d);
		files.push(f);
	}
	drafts.set(key, { kind, files, items, device, created: Date.now() });
	return key;
}

/** The draft, if it exists and belongs to this device. */
export function getDraft(key: string, device: string): Draft | null {
	const d = drafts.get(key);
	return d && d.device === device ? d : null;
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

export async function dropDraft(key: string) {
	const d = drafts.get(key);
	drafts.delete(key);
	if (d) await Promise.all(d.files.map((f) => rm(f, { force: true })));
}

async function sweep() {
	const now = Date.now();
	for (const [k, d] of drafts) if (now - d.created > DRAFT_TTL_MS) await dropDraft(k);
}
