/**
 * Parses a page range such as "1-3, 5" into sorted, distinct 1-based page numbers.
 * An empty range means all pages. Returns null when the text is not a valid range.
 */
export function parseRange(text: string, pageCount: number): number[] | null {
	const t = text.trim();
	if (t === '') return Array.from({ length: pageCount }, (_, i) => i + 1);
	const out = new Set<number>();
	for (const part of t.split(',')) {
		const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(part);
		if (!m) return null;
		const from = Number(m[1]);
		const to = m[2] === undefined ? from : Number(m[2]);
		if (from < 1 || to < from || to > pageCount) return null;
		for (let p = from; p <= to; p++) out.add(p);
	}
	return [...out].sort((a, b) => a - b);
}
