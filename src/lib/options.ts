import { z } from 'zod';

export const PAPERS = ['plain', 'thick1', 'thick1p', 'thick2', 'thick3', 'thick4', 'letterhead', 'colored', 'label', 'transparency', 'singleside', 'special'] as const;
/** Shown at once; the rest sit behind "more paper types". */
export const COMMON_PAPERS = ['plain', 'thick1', 'thick1p', 'thick2'] as const satisfies readonly Paper[];
export type Paper = (typeof PAPERS)[number];

/** Grammage per paper type. Ranges follow the usual C224e spec and MUST be checked in its manual. */
export const PAPER_GSM: Partial<Record<Paper, [number, number]>> = {
	plain: [60, 90],
	thick1: [91, 120],
	thick1p: [121, 157],
	thick2: [158, 209],
	thick3: [210, 256],
	thick4: [257, 300]
};

/** Paper from Thick 2 up goes through the bypass tray only. */
export const bypassOnly = (p: Paper) => p === 'thick2' || p === 'thick3' || p === 'thick4';
/** Thick paper is loaded by hand in the bypass tray; the cassettes hold plain paper. */
export const usesBypass = (p: Paper) => p !== 'plain';

/** Every choice the print page offers. Shared by the page and the server. */
export const PrintOptions = z.object({
	copies: z.number().int().min(1).max(20),
	/** Empty means all pages. Documents only. */
	range: z.string().max(60),
	size: z.enum(['A5', 'A4', 'A3']),
	color: z.enum(['color', 'mono']),
	duplex: z.enum(['off', 'long', 'short']),
	/** Pages or photos per sheet. Documents allow 1, 2, 4; photos 1, 2, 4, 9. */
	nup: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(9)]),
	/** Photos only: whole image with white edges, or cropped to fill the cell. */
	fit: z.enum(['fit', 'fill']),
	/**
	 * Photos only. "auto" keeps a portrait sheet and turns each photo to fill its cell;
	 * portrait or landscape fixes the sheet and keeps photos as they were taken.
	 */
	orientation: z.enum(['auto', 'portrait', 'landscape']),
	/** White edge in mm. The printer cannot print closer than 5 mm to the edge. */
	margin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
	paper: z.enum(PAPERS)
});
export type PrintOptions = z.infer<typeof PrintOptions>;

export type Kind = 'doc' | 'photo';

export const PRESETS = {
	doc: { copies: 1, range: '', size: 'A4', color: 'color', duplex: 'long', nup: 1, fit: 'fit', orientation: 'auto', margin: 5, paper: 'plain' },
	photo: { copies: 1, range: '', size: 'A4', color: 'color', duplex: 'off', nup: 1, fit: 'fit', orientation: 'auto', margin: 5, paper: 'thick1p' }
} as const satisfies Record<Kind, PrintOptions>;
export const MARGINS = [5, 10, 15, 20] as const;

export type PresetKey = keyof typeof PRESETS;

export const NUP_CHOICES: Record<Kind, readonly PrintOptions['nup'][]> = { doc: [1, 2, 4], photo: [1, 2, 4, 9] };

/** Sheets of paper used, so the summary can show it before sending. */
export function sheetCount(items: number, o: Pick<PrintOptions, 'copies' | 'duplex' | 'nup'>): number {
	const faces = Math.ceil(items / o.nup);
	return Math.ceil(faces / (o.duplex === 'off' ? 1 : 2)) * o.copies;
}

/** Brings options in line with the file kind and paper, so the server never prints a mixed set. */
export function normalize(o: PrintOptions, kind: Kind): PrintOptions {
	const nup = NUP_CHOICES[kind].includes(o.nup) ? o.nup : 1;
	// Thick paper through the bypass tray is printed one-sided.
	const duplex = usesBypass(o.paper) ? 'off' : o.duplex;
	return { ...o, nup, duplex, range: kind === 'doc' ? o.range : '', orientation: kind === 'photo' ? o.orientation : 'auto' };
}
