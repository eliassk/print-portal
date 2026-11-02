import { usesBypass, type PrintOptions } from './options.ts';
import type { PrinterStatus, Tray } from './status.ts';

/**
 * The tray a job will most likely use: the bypass tray for thick paper, otherwise the
 * fullest cassette holding the chosen size. Null when the printer reports none.
 */
export function trayFor(o: Pick<PrintOptions, 'paper' | 'size'>, s: PrinterStatus | null): Tray | null {
	if (!s) return null;
	if (usesBypass(o.paper)) return s.trays.find((t) => t.key === 'bypass') ?? null;
	const fit = s.trays.filter((t) => t.key !== 'bypass' && t.size === o.size);
	return fit.sort((a, b) => (b.level ?? -1) - (a.level ?? -1))[0] ?? null;
}
