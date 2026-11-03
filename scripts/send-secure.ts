// Stage 0: sends one PDF as a Secure Print job, to prove release at the panel.
// Usage: pnpm send-secure <file.pdf> [--id 203] [--pin 2030] [--mono] [--duplex long|short] [--a3] [--copies 2] [--paper thick2] [--host 192.168.1.50] [--dry]
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { PAPERS, type Paper } from '../src/lib/options.ts';
import { buildSecureJob } from '../src/lib/server/pjl.ts';
import { sendRaw } from '../src/lib/server/printer.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		id: { type: 'string', default: '203' },
		pin: { type: 'string', default: '2030' },
		mono: { type: 'boolean', default: false },
		duplex: { type: 'string', default: 'off' },
		a3: { type: 'boolean', default: false },
		copies: { type: 'string', default: '1' },
		paper: { type: 'string', default: 'plain' },
		host: { type: 'string', default: process.env.PRINTER_HOST },
		port: { type: 'string', default: process.env.PRINTER_PORT ?? '9100' },
		dry: { type: 'boolean', default: false }
	}
});

const file = positionals[0];
if (!file) {
	console.error('Usage: pnpm send-secure <file.pdf> [--id 203] [--pin 2030] [--mono] [--duplex long|short] [--a3] [--paper thick2] [--host 192.168.1.50] [--dry]');
	process.exit(1);
}
if (!PAPERS.includes(values.paper as Paper)) {
	console.error(`--paper MUST be one of: ${PAPERS.join(', ')}`);
	process.exit(1);
}
const duplex = values.duplex === 'long' || values.duplex === 'short' ? values.duplex : 'off';
const job = buildSecureJob(
	{
		id: values.id,
		pin: values.pin,
		options: {
			copies: Number(values.copies),
			range: '',
			size: values.a3 ? 'A3' : 'A4',
			color: values.mono ? 'mono' : 'color',
			duplex,
			nup: 1,
			fit: 'fit',
			orientation: 'auto',
			margin: 5,
			paper: values.paper as Paper
		}
	},
	await readFile(file)
);

if (values.dry) {
	await writeFile('secure-job.prn', job);
	console.log('Wrote secure-job.prn, nothing sent.');
} else {
	if (!values.host) {
		console.error('Set PRINTER_HOST or pass --host <printer address>.');
		process.exit(1);
	}
	await sendRaw(values.host, Number(values.port), job);
	console.log(`Sent to ${values.host}:${values.port}. At the panel: Skrzynka → System → Wydruk bezpieczny, ID ${values.id}, PIN ${values.pin}.`);
}
