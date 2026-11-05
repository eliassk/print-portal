import QRCode from 'qrcode';
import { htmlToPdf } from './tools.ts';
import a3 from '../../../docs/instrukcja-a3.html?raw';
import a4 from '../../../docs/instrukcja-a4.html?raw';

export const POSTER_SIZES = ['a3', 'a4'] as const;
export type PosterSize = (typeof POSTER_SIZES)[number];

/** What the guides in docs/ show where each installation differs. */
const SAMPLE = { url: 'https://print.example.com', host: 'print.example.com', bot: 'Portal druku' };

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Cuts out the element that starts at `start`, with everything nested in it. */
function cutElement(html: string, start: number): string {
	const tag = /<\/?div\b[^>]*>/g;
	tag.lastIndex = start;
	let depth = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		depth += m[0][1] === '/' ? -1 : 1;
		if (depth === 0) return html.slice(0, start) + html.slice(tag.lastIndex);
	}
	throw new Error('Unbalanced poster markup');
}

/**
 * The printable guide for this portal: its address, a QR code for it and the bot's name.
 * Without a bot the Telegram section is left out.
 */
export async function renderPoster(size: PosterSize, o: { url: string; bot: string | null }): Promise<string> {
	let html = size === 'a3' ? a3 : a4;
	const url = o.url.replace(/\/+$/, '');
	const host = url.replace(/^https?:\/\//, '');

	html = html.replaceAll(SAMPLE.url, escape(url)).replaceAll(SAMPLE.host, escape(host));
	const qr = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
	html = html.replace(/(<div class="qrc">)<svg[\s\S]*?<\/svg>/, (_, open) => open + qr);

	if (o.bot) {
		const bot = escape(o.bot);
		html = html
			.replaceAll(`<b>${SAMPLE.bot}</b><small>bot</small>`, `<b>${bot}</b><small>bot</small>`)
			.replaceAll(`czatu <span class="k">${SAMPLE.bot}</span>`, `czatu <span class="k">${bot}</span>`);
	} else {
		const tg = html.indexOf('<div class="band tgb"');
		if (tg >= 0) html = cutElement(html, tg);
		// On A3 the printer steps get the room the Telegram section had. A4 has them on their own page.
		if (size === 'a3') {
			const roomy = `
  .band.pr { display:flex; flex-direction:column; }
  .band.pr > .row { flex:1; grid-template-rows:repeat(2,1fr); align-items:center; }
  .pr .mfp { width:80mm; }
  .pr .c > .cap { width:88mm; font-size:4.2mm; }
`;
			html = html.replace('</style>', roomy + '</style>');
		}
	}

	return html;
}

// Posters change only with the address, the bot and a new build, so each one is rendered once.
const pdfs = new Map<string, Promise<Uint8Array | null>>();

/** The poster as PDF, or null when the server has no Chromium. */
export function posterPdf(size: PosterSize, o: { url: string; bot: string | null }): Promise<Uint8Array | null> {
	const key = JSON.stringify([size, o.url, o.bot]);
	let pdf = pdfs.get(key);
	if (!pdf) {
		pdf = renderPoster(size, o).then(htmlToPdf);
		// A failed render MUST NOT stay cached.
		pdf.catch(() => pdfs.delete(key));
		pdfs.set(key, pdf);
	}
	return pdf;
}
