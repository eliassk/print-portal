import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';

/** A visible worksheet and the cells that actually hold data, e.g. "A1:H42". Null when empty. */
export type SheetInfo = { name: string; range: string | null };
export type Book = { sheets: SheetInfo[]; active: number };

export const SheetPick = z.object({
	sheets: z
		.array(z.object({ name: z.string().min(1).max(100), range: z.string().max(40) }))
		.min(1)
		.max(50),
	/** Shrinks wide sheets to one page across. */
	fit: z.boolean()
});
export type SheetPick = z.infer<typeof SheetPick>;

const WB = 'xl/workbook.xml';
const RELS = 'xl/_rels/workbook.xml.rels';

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const unescape = (s: string) =>
	s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const setAttr = (tag: string, name: string, value: string) =>
	new RegExp(`\\s${name}="`).test(tag)
		? tag.replace(new RegExp(`(\\s${name}=")[^"]*"`), `$1${value}"`)
		: tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
const dropAttr = (tag: string, name: string) => tag.replace(new RegExp(`\\s${name}="[^"]*"`), '');

const colNum = (c: string) => [...c.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number) => {
	let s = '';
	for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
};

const CELL = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i;

/** "a1:f30" → "$A$1:$F$30". Null for anything that is not a cell or a cell range. */
export function normalizeRange(input: string): string | null {
	const parts = input.trim().split(':');
	if (parts.length < 1 || parts.length > 2) return null;
	const cells = parts.map((p) => p.trim().match(CELL));
	if (cells.some((m) => !m || Number(m[2]) < 1 || colNum(m[1]) > 16384)) return null;
	const [a, b = a] = cells as RegExpMatchArray[];
	const [c1, c2] = [colNum(a[1]), colNum(b[1])].sort((x, y) => x - y);
	const [r1, r2] = [Number(a[2]), Number(b[2])].sort((x, y) => x - y);
	return `$${colName(c1)}$${r1}:$${colName(c2)}$${r2}`;
}

/** The smallest range around cells with a value or a formula. Cells with formatting only do not count. */
export function dataRange(sheetXml: string): string | null {
	let [c1, r1, c2, r2] = [Infinity, Infinity, 0, 0];
	for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
		if (!m[2] || !/<(v|is|f)\b/.test(m[2])) continue;
		const ref = attr(m[1], 'r')?.match(CELL);
		if (!ref) continue;
		const [c, r] = [colNum(ref[1]), Number(ref[2])];
		[c1, r1, c2, r2] = [Math.min(c1, c), Math.min(r1, r), Math.max(c2, c), Math.max(r2, r)];
	}
	return c2 ? `${colName(c1)}${r1}:${colName(c2)}${r2}` : null;
}

type Entry = { tag: string; name: string; hidden: boolean; path: string | null };

function entries(files: Record<string, Uint8Array>): Entry[] {
	const wb = strFromU8(files[WB]);
	const rels = strFromU8(files[RELS] ?? new Uint8Array());
	const targets = new Map<string, string>();
	for (const [tag] of rels.matchAll(/<Relationship\b[^>]*>/g)) {
		const id = attr(tag, 'Id');
		const target = attr(tag, 'Target');
		if (!id || !target || !/\/worksheet$/.test(attr(tag, 'Type') ?? '')) continue;
		targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
	}
	return [...wb.matchAll(/<sheet\b[^>]*\/?>/g)].map(([tag]) => {
		const path = targets.get(attr(tag, 'r:id') ?? '') ?? null;
		return {
			tag,
			name: unescape(attr(tag, 'name') ?? ''),
			hidden: (attr(tag, 'state') ?? 'visible') !== 'visible',
			path: path && files[path] ? path : null
		};
	});
}

function open(xlsx: Uint8Array): Record<string, Uint8Array> {
	const files = unzipSync(xlsx);
	if (!files[WB]) throw new Error('not a workbook');
	return files;
}

/** Visible worksheets of an .xlsx file. Chart sheets and hidden sheets are left out. */
export function readBook(xlsx: Uint8Array): Book {
	const files = open(xlsx);
	const all = entries(files);
	const activeTab = Number(attr(strFromU8(files[WB]).match(/<workbookView\b[^>]*>/)?.[0] ?? '', 'activeTab') ?? 0);
	const sheets: SheetInfo[] = [];
	let active = 0;
	for (const [i, e] of all.entries()) {
		if (e.hidden || !e.path) continue;
		if (i === activeTab) active = sheets.length;
		sheets.push({ name: e.name, range: dataRange(strFromU8(files[e.path])) });
	}
	return { sheets, active };
}

const FOLLOWS_PAGE_SETUP = ['headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];

function fitSheet(xml: string, orientation: 'portrait' | 'landscape' | null): string {
	// sheetPr MUST stay the first child of worksheet; pageSetUpPr is its last child.
	if (/<sheetPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1></sheetPr>');
	if (!/<sheetPr\b/.test(xml)) xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr></sheetPr>');
	if (/<pageSetUpPr\b/.test(xml)) xml = xml.replace(/<pageSetUpPr\b[^>]*\/>/, (t) => setAttr(t, 'fitToPage', '1'));
	else xml = xml.replace(/<\/sheetPr>/, '<pageSetUpPr fitToPage="1"/></sheetPr>');

	const edit = (t: string) => {
		t = setAttr(setAttr(t, 'fitToWidth', '1'), 'fitToHeight', '0');
		t = dropAttr(t, 'scale');
		return orientation ? setAttr(t, 'orientation', orientation) : t;
	};
	if (/<pageSetup\b/.test(xml)) return xml.replace(/<pageSetup\b[^>]*\/>/, edit);
	const tag = edit('<pageSetup/>');
	if (/<pageMargins\b[^>]*\/>/.test(xml)) return xml.replace(/(<pageMargins\b[^>]*\/>)/, `$1${tag}`);
	const next = FOLLOWS_PAGE_SETUP.map((n) => xml.search(new RegExp(`<${n}\\b`))).filter((i) => i >= 0);
	const at = next.length ? Math.min(...next) : xml.lastIndexOf('</worksheet>');
	return xml.slice(0, at) + tag + xml.slice(at);
}

/**
 * Edits a copy of the workbook so LibreOffice prints only the picked sheets and ranges.
 * Other sheets are hidden, each range becomes the sheet's print area.
 * Throws RangeError on an unknown sheet or a malformed range.
 */
export function prepareBook(xlsx: Uint8Array, pick: SheetPick, orientation: 'portrait' | 'landscape' | null = null): Uint8Array {
	const files = open(xlsx);
	const all = entries(files);
	const picked = new Map<string, string>();
	for (const s of pick.sheets) {
		const e = all.find((x) => x.name === s.name && !x.hidden && x.path);
		if (!e) throw new RangeError(`unknown sheet ${s.name}`);
		const range = s.range.trim() ? normalizeRange(s.range) : null;
		if (s.range.trim() && !range) throw new RangeError(`bad range ${s.range}`);
		picked.set(e.name, range ?? '');
	}

	let wb = strFromU8(files[WB]);
	let firstShown = -1;
	const names: string[] = [];
	for (const [i, e] of all.entries()) {
		const show = picked.has(e.name) && !e.hidden && e.path;
		if (show && firstShown < 0) firstShown = i;
		if (!show && !e.hidden) wb = wb.replace(e.tag, setAttr(e.tag, 'state', 'hidden'));
		const range = show ? picked.get(e.name) : '';
		if (range) names.push(`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${escape(e.name.replace(/'/g, "''"))}'!${range}</definedName>`);
		if (show && pick.fit) files[e.path!] = strToU8(fitSheet(strFromU8(files[e.path!]), orientation));
	}
	// A hidden sheet MUST NOT stay active or first, or the workbook opens on nothing.
	wb = wb.replace(/<workbookView\b[^>]*\/?>/, (t) => setAttr(setAttr(t, 'activeTab', String(firstShown)), 'firstSheet', String(firstShown)));
	const shownIds = new Set([...picked.keys()].map((n) => String(all.findIndex((e) => e.name === n))));
	wb = wb.replace(/<definedName\b[^>]*name="_xlnm\.Print_Area"[^>]*>[\s\S]*?<\/definedName>/g, (t) =>
		shownIds.has(attr(t, 'localSheetId') ?? '') ? '' : t
	);
	if (names.length) {
		if (/<definedNames\b[^>]*\/>/.test(wb)) wb = wb.replace(/<definedNames\b[^>]*\/>/, '<definedNames></definedNames>');
		if (/<\/definedNames>/.test(wb)) wb = wb.replace('</definedNames>', `${names.join('')}</definedNames>`);
		else {
			const anchor = /<\/externalReferences>/.test(wb) ? '</externalReferences>' : '</sheets>';
			wb = wb.replace(anchor, `${anchor}<definedNames>${names.join('')}</definedNames>`);
		}
	}
	wb = wb.replace(/<definedNames><\/definedNames>/, '');
	files[WB] = strToU8(wb);
	return zipSync(files as Zippable, { level: 6 });
}
