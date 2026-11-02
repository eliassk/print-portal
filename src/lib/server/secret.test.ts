import { describe, expect, it } from 'vitest';
import { newId, newPin } from './secret.ts';

describe('secrets', () => {
	it('makes 6-digit PINs', () => expect(newPin()).toMatch(/^\d{6}$/));
	it('avoids IDs already in use', () => {
		const taken = new Set(Array.from({ length: 8999 }, (_, i) => String(1000 + i)));
		expect(newId(taken)).toBe('9999');
	});
});
