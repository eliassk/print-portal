// A fake bizhub C224e for local testing.
// Raw port: saves every job to data/mock-jobs/ and prints its Secure Print header.
// IPP port: answers status requests with the response recorded from the real printer.
// Usage: pnpm mock-printer [--raw 9190] [--ipp 6310]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as http } from 'node:http';
import { createServer as tcp } from 'node:net';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { raw: { type: 'string', default: '9190' }, ipp: { type: 'string', default: '6310' } } });
const dir = join('data', 'mock-jobs');
mkdirSync(dir, { recursive: true });
const status = readFileSync(new URL('../src/lib/server/fixtures/c224e-status.ipp', import.meta.url));

tcp((socket) => {
	const chunks: Buffer[] = [];
	socket.on('data', (c) => chunks.push(c));
	socket.on('end', () => {
		const job = Buffer.concat(chunks);
		const text = job.toString('latin1');
		const pick = (k: string) => new RegExp(`@PJL SET ${k} = "?([^"\\r\\n]*)`).exec(text)?.[1] ?? '?';
		const pdfAt = job.indexOf('%PDF');
		const end = job.lastIndexOf('\x1b%-12345X@PJL EOJ');
		const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${pick('KMJOBID')}`;
		writeFileSync(join(dir, `${name}.prn`), job);
		if (pdfAt >= 0 && end > pdfAt) writeFileSync(join(dir, `${name}.pdf`), job.subarray(pdfAt, end));
		console.log(
			`Job received · ID ${pick('KMJOBID')} · PIN ${pick('HOLDKEY')} · ${pick('PAPER')} · ${pick('MEDIAWEIGHT')} · ${pick('MEDIASOURCE')} · duplex ${pick('DUPLEX')} · ${pick('DRIVERCOLORSELECT')} · ${pick('COPIES')} copies`
		);
		console.log(`  saved ${join(dir, name)}.pdf`);
	});
}).listen(Number(values.raw), '127.0.0.1', () => console.log(`Mock printer: raw jobs on 127.0.0.1:${values.raw}`));

http((req, res) => {
	req.resume();
	req.on('end', () => {
		res.writeHead(200, { 'content-type': 'application/ipp' });
		res.end(status);
	});
}).listen(Number(values.ipp), '127.0.0.1', () => console.log(`Mock printer: IPP status on 127.0.0.1:${values.ipp}`));
