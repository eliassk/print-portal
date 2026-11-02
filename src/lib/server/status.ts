import { getPrinterAttributesRequest, parseResponse, type Value } from './ipp.ts';
import type { PrinterStatus, Toner, Tray, TrayState } from '../status.ts';

const ATTRS = ['printer-input-tray', 'marker-names', 'marker-levels', 'printer-state-reasons'];
const TRAY_NAMES: Record<string, Tray['key']> = { 'Bypass Tray': 'bypass', 'Tray 1': 'tray1', 'Tray 2': 'tray2', 'Tray 3': 'tray3' };
const TONER: Record<string, Toner['key']> = {
	'Toner Cartridge (K)': 'black',
	'Toner Cartridge (C)': 'cyan',
	'Toner Cartridge (M)': 'magenta',
	'Toner Cartridge (Y)': 'yellow'
};

/** ISO size from feed and cross-feed in micrometres. */
function sizeName(feed: number, xfeed: number): string | null {
	const [a, b] = [feed, xfeed].sort((x, y) => x - y).map((v) => Math.round(v / 1000));
	const known: Record<string, string> = { '148x210': 'A5', '210x297': 'A4', '297x420': 'A3' };
	return known[`${a}x${b}`] ?? null;
}

function trayState(level: number | null): TrayState {
	if (level === null) return 'unknown';
	if (level === 0) return 'empty';
	if (level <= 20) return 'low';
	return level >= 90 ? 'full' : 'ok';
}

/** Turns a Get-Printer-Attributes result into the status the app shows. */
export function toStatus(attrs: Record<string, Value[]>, now = Date.now()): PrinterStatus {
	const trays: Tray[] = [];
	for (const raw of attrs['printer-input-tray'] ?? []) {
		const f = Object.fromEntries(
			String(raw)
				.split(/(?<!\\);/)
				.filter(Boolean)
				.map((kv) => {
					const at = kv.indexOf('=');
					return [kv.slice(0, at), kv.slice(at + 1).replace(/\\ /g, ' ')];
				})
		);
		const key = TRAY_NAMES[f.name];
		if (!key) continue;
		const max = Number(f.maxcapacity);
		const lvl = Number(f.level);
		// Negative levels mean the printer does not know.
		const level = max > 0 && lvl >= 0 ? Math.round((lvl / max) * 100) : null;
		trays.push({ key, size: sizeName(Number(f.mediafeed), Number(f.mediaxfeed)), level, state: trayState(level) });
	}
	const names = (attrs['marker-names'] ?? []).map(String);
	const levels = (attrs['marker-levels'] ?? []).map(Number);
	const toner: Toner[] = [];
	names.forEach((n, i) => {
		const key = TONER[n];
		if (key && levels[i] >= 0) toner.push({ key, level: levels[i] });
	});
	const reasons = (attrs['printer-state-reasons'] ?? []).map(String);
	return { online: true, trays, toner, lowPaper: reasons.some((r) => r.startsWith('media-low')), checkedAt: now };
}

let cache: PrinterStatus | null = null;

/** Printer status, cached for 30 s. Never throws: an unreachable printer is reported offline. */
export async function printerStatus(host: string): Promise<PrinterStatus> {
	if (cache && Date.now() - cache.checkedAt < 30_000) return cache;
	try {
		const uri = `ipp://${host}/ipp`;
		const res = await fetch(`http://${host}:631/ipp`, {
			method: 'POST',
			headers: { 'content-type': 'application/ipp' },
			body: new Uint8Array(getPrinterAttributesRequest(uri, ATTRS)),
			signal: AbortSignal.timeout(5000)
		});
		const { status, attrs } = parseResponse(new Uint8Array(await res.arrayBuffer()));
		if (!res.ok || status >= 0x0400) throw new Error(`IPP status ${status}`);
		cache = toStatus(attrs);
	} catch (e) {
		console.error('Printer status failed', e);
		cache = { online: false, trays: [], toner: [], lowPaper: false, checkedAt: Date.now() };
	}
	return cache;
}
