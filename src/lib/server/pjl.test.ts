import { describe, expect, it } from 'vitest';
import { buildSecureJob } from './pjl.ts';
import type { PrintOptions } from '../options.ts';

const opts: PrintOptions = { copies: 2, range: '', size: 'A4', color: 'color', duplex: 'long', nup: 1, fit: 'fit', orientation: 'auto', margin: 5, paper: 'plain' };
const pdf = new TextEncoder().encode('%PDF-1.7 test');
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('buildSecureJob', () => {
	it('writes the Secure Print header the printer accepted', () => {
		const out = text(buildSecureJob({ id: '4417', pin: '839205', options: opts }, pdf));
		expect(out.startsWith('\x1b%-12345X@PJL JOB')).toBe(true);
		for (const line of [
			'@PJL SET KMCOETYPE = 0',
			'@PJL SET HOLD = ON',
			'@PJL SET HOLDTYPE = PRIVATE',
			'@PJL SET KMJOBID = "4417"',
			'@PJL SET HOLDKEY = "839205"',
			'@PJL SET COPIES = 2',
			'@PJL SET DUPLEX = ON',
			'@PJL SET PAPER = A4',
			'@PJL SET MEDIASOURCE = AUTO',
			'@PJL SET MEDIAWEIGHT = NORMAL',
			'@PJL ENTER LANGUAGE = PDF'
		])
			expect(out).toContain(line);
		expect(out).not.toContain('HOLDKEY2');
	});

	it('places the PDF right after ENTER LANGUAGE and ends with UEL', () => {
		const out = text(buildSecureJob({ id: '1', pin: '1234', options: opts }, pdf));
		expect(out).toContain('@PJL ENTER LANGUAGE = PDF\r\n%PDF-1.7 test\x1b%-12345X@PJL EOJ');
		expect(out.endsWith('\x1b%-12345X')).toBe(true);
	});

	it('uses a neutral job name, never a file name', () => {
		const out = text(buildSecureJob({ id: '4417', pin: '839205', options: opts }, pdf));
		expect(out).toContain('@PJL SET JOBNAME = "Portal 4417"');
	});

	it('maps mono and single-sided', () => {
		const out = text(
			buildSecureJob({ id: '1', pin: '1234', options: { ...opts, color: 'mono', duplex: 'off' } }, pdf)
		);
		expect(out).toContain('DUPLEX = OFF');
		expect(out).toContain('DRIVERCOLORSELECT = GRAYSCALE');
	});

	it('sends thick paper through the bypass tray', () => {
		const out = text(buildSecureJob({ id: '1', pin: '1234', options: { ...opts, paper: 'thick2' } }, pdf));
		expect(out).toContain('MEDIASOURCE = MANUALFEED');
		expect(out).toContain('MEDIAWEIGHT = THICK2');
	});

	it('sends A5 as the paper size', () =>
		expect(text(buildSecureJob({ id: '1', pin: '1234', options: { ...opts, size: 'A5' } }, pdf))).toContain('@PJL SET PAPER = A5'));

	it('refuses IDs and PINs that are not digits', () => {
		expect(() => buildSecureJob({ id: '1"\r\n@PJL', pin: '1234', options: opts }, pdf)).toThrow();
		expect(() => buildSecureJob({ id: '1', pin: '12', options: opts }, pdf)).toThrow();
	});
});
