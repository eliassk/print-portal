import { usesBypass, type Paper, type PrintOptions } from '../options.ts';

// Captured from the Windows driver: plain paper is MEDIATYPE=PAPER, MEDIAWEIGHT=NORMAL, MEDIASOURCE=AUTO.
// The thick weights and the bypass name are NOT captured yet. Stage 0 MUST confirm them with
// one driver capture per paper type; only this table changes. Every value but plain is unverified.
const MEDIA: Record<Paper, { type: string; weight: string; color?: string; preprinted?: boolean }> = {
	plain: { type: 'PAPER', weight: 'NORMAL' },
	thick1: { type: 'PAPER', weight: 'THICK1' },
	thick1p: { type: 'PAPER', weight: 'THICK1PLUS' },
	thick2: { type: 'PAPER', weight: 'THICK2' },
	thick3: { type: 'PAPER', weight: 'THICK3' },
	thick4: { type: 'PAPER', weight: 'THICK4' },
	letterhead: { type: 'PAPER', weight: 'NORMAL', preprinted: true },
	colored: { type: 'PAPER', weight: 'NORMAL', color: 'OTHER' },
	label: { type: 'LABEL', weight: 'NORMAL' },
	transparency: { type: 'TRANSPARENCY', weight: 'NORMAL' },
	singleside: { type: 'SINGLESIDE', weight: 'NORMAL' },
	special: { type: 'SPECIAL', weight: 'NORMAL' }
};
const BYPASS = 'MANUALFEED';

const UEL = '\x1b%-12345X';

export interface SecureJob {
	/** Secure Print ID typed on the panel. Digits only. */
	id: string;
	/** Secure Print password typed on the panel. Digits only. */
	pin: string;
	options: PrintOptions;
}

/**
 * Wraps a PDF in the PJL header the bizhub C224e reads as a Secure Print job.
 * KMCOETYPE=0 sends the PIN unencrypted; the printer stores such jobs (Job History 6666).
 * Only allowlisted values reach the header, so no user text can inject PJL.
 */
export function buildSecureJob(job: SecureJob, pdf: Uint8Array): Uint8Array {
	if (!/^\d{1,16}$/.test(job.id)) throw new Error('ID MUST be 1–16 digits');
	if (!/^\d{4,16}$/.test(job.pin)) throw new Error('PIN MUST be 4–16 digits');
	const o = job.options;
	const name = `Portal ${job.id}`;
	const lines = [
		`${UEL}@PJL JOB NAME="${name}"`,
		'@PJL SET KMCOETYPE = 0',
		'@PJL SET USERNAME = "PrintPortal"',
		`@PJL SET JOBNAME = "${name}"`,
		'@PJL SET HOLD = ON',
		'@PJL SET HOLDTYPE = PRIVATE',
		`@PJL SET KMJOBID = "${job.id}"`,
		`@PJL SET HOLDKEY = "${job.pin}"`,
		`@PJL SET COPIES = ${o.copies}`,
		`@PJL SET DUPLEX = ${o.duplex === 'off' ? 'OFF' : 'ON'}`,
		// Captured driver output pairs long-edge duplex with BINDING=LEFT. TOP for short edge is unverified.
		`@PJL SET BINDING = ${o.duplex === 'short' ? 'TOP' : 'LEFT'}`,
		`@PJL SET PAPER = ${o.size}`,
		`@PJL SET MEDIASOURCE = ${usesBypass(o.paper) ? BYPASS : 'AUTO'}`,
		`@PJL SET MEDIATYPE = ${MEDIA[o.paper].type}`,
		`@PJL SET MEDIAWEIGHT = ${MEDIA[o.paper].weight}`,
		`@PJL SET MEDIACOLOR = ${MEDIA[o.paper].color ?? 'NONE'}`,
		`@PJL SET MEDIAPREPRINTED = ${MEDIA[o.paper].preprinted ? 'ON' : 'OFF'}`,
		// COLOR is from the capture. GRAYSCALE and PLANESINUSE=1 for mono are unverified.
		`@PJL SET DRIVERCOLORSELECT = ${o.color === 'color' ? 'COLOR' : 'GRAYSCALE'}`,
		`@PJL SET PLANESINUSE = ${o.color === 'color' ? 3 : 1}`,
		'@PJL ENTER LANGUAGE = PDF',
		''
	];
	const head = new TextEncoder().encode(lines.join('\r\n'));
	const tail = new TextEncoder().encode(`${UEL}@PJL EOJ NAME="${name}"\r\n${UEL}`);
	const out = new Uint8Array(head.length + pdf.length + tail.length);
	out.set(head, 0);
	out.set(pdf, head.length);
	out.set(tail, head.length + pdf.length);
	return out;
}
