import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { renderPoster } from './poster.ts';

const url = 'https://druk.firma.test/';

describe('renderPoster', () => {
	it.each(['a3', 'a4'] as const)('puts this portal and its bot on the %s poster', async (size) => {
		const html = await renderPoster(size, { url, bot: 'Drukarka <Biuro>' });
		expect(html).not.toContain('example.com');
		expect(html).toContain('druk.firma.test');
		expect(html).toContain('<b>Drukarka &lt;Biuro&gt;</b><small>bot</small>');
		expect(html).toContain('class="band tgb"');
		const qr = await QRCode.toString('https://druk.firma.test', { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
		expect(html).toContain(qr);
	});

	it.each(['a3', 'a4'] as const)('leaves Telegram out of the %s poster without a bot', async (size) => {
		const html = await renderPoster(size, { url, bot: null });
		expect(html).not.toContain('class="band tgb"');
		expect(html).not.toContain('Telegram z drukarką');
		// The printer steps are still there.
		expect(html).toContain('Odbierz przy drukarce');
	});
});
