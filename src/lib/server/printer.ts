import { Socket } from 'node:net';

/** Sends raw bytes to the printer's port 9100 and resolves once they are written. */
export function sendRaw(host: string, port: number, data: Uint8Array, timeoutMs = 15000): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = new Socket();
		s.setTimeout(timeoutMs, () => s.destroy(new Error('Printer timed out')));
		s.once('error', reject);
		s.connect(port, host, () => s.end(data, () => resolve()));
	});
}
