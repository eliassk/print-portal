import { describe, expect, it } from 'vitest';
import { passwordMatches, signAdmin, verifyAdmin } from './auth.ts';

describe('admin token', () => {
	it('verifies its own signature', () => expect(verifyAdmin('s', signAdmin('s', 0), 1000)).toBe(true));
	it('rejects another secret', () => expect(verifyAdmin('x', signAdmin('s', 0), 1000)).toBe(false));
	it('rejects an expired token', () => expect(verifyAdmin('s', signAdmin('s', 0), 13 * 3600_000)).toBe(false));
	it('rejects a tampered expiry', () => {
		const [, sig] = signAdmin('s', 0).split('.');
		expect(verifyAdmin('s', `${20 * 3600_000}.${sig}`, 1000)).toBe(false);
	});
	it('compares passwords', () => {
		expect(passwordMatches('a', 'a')).toBe(true);
		expect(passwordMatches('a', 'b')).toBe(false);
	});
});
