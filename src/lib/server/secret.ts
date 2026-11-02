import { randomInt } from 'node:crypto';

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

/** A 6-digit PIN from a crypto RNG. */
export const newPin = () => digits(6);

/** A 4-digit job ID not in `taken`. IDs MUST stay unique while their jobs wait on the printer. */
export function newId(taken: ReadonlySet<string>): string {
	const start = randomInt(1000, 10000);
	for (let i = 0; i < 9000; i++) {
		const id = String(((start - 1000 + i) % 9000) + 1000);
		if (!taken.has(id)) return id;
	}
	throw new Error('No free job ID');
}
