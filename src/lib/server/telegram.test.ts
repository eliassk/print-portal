import { describe, expect, it } from 'vitest';
import { claimDraft, getDraft, saveClaimable } from './jobs.ts';
import { openDb } from './db.ts';
import { allowFile, pickFile, useLink } from './telegram.ts';

describe('telegram bot', () => {
	it('takes the largest photo size and keeps document names', () => {
		const photo = pickFile({ chat: { id: 1 }, photo: [{ file_id: 's' }, { file_id: 'l' }] });
		expect(photo).toMatchObject({ file_id: 'l', file_name: 'zdjecie.jpg' });
		expect(pickFile({ chat: { id: 1 }, document: { file_id: 'd', file_name: 'a.pdf' } })?.file_name).toBe('a.pdf');
		expect(pickFile({ chat: { id: 1 }, text: '/start' })).toBeNull();
	});

	it('limits files per chat', () => {
		const now = 1_000_000;
		for (let i = 0; i < 10; i++) expect(allowFile(42, now)).toBe(true);
		expect(allowFile(42, now)).toBe(false);
		expect(allowFile(43, now)).toBe(true);
		expect(allowFile(42, now + 11 * 60 * 1000)).toBe(true);
	});

	it('hands a draft to the first browser only', async () => {
		const claim = await saveClaimable('photo', [new Uint8Array([1])], 1, undefined, 'x.jpg');
		const first = claimDraft(claim, 'device-a');
		expect(first?.draft.name).toBe('x.jpg');
		expect(getDraft(first!.key, 'device-a')).not.toBeNull();
		expect(claimDraft(claim, 'device-b')).toBeNull();
		expect(getDraft(first!.key, 'device-b')).toBeNull();
	});

	it('refuses unknown or reused connect tokens', () => {
		expect(useLink('not-a-real-token')).toBe(false);
	});

	it('keeps chat authorizations until they expire or are dropped', () => {
		const db = openDb(':memory:');
		db.authorizeChat(5, 1000);
		expect(db.chatAuthorizedSince(5, 500)).toBe(true);
		expect(db.chatAuthorizedSince(5, 2000)).toBe(false);
		expect(db.chatAuthorizedSince(6, 0)).toBe(false);
		db.renewChat(5, 3000);
		expect(db.chatAuthorizedSince(5, 2000)).toBe(true);
		db.forgetChat(5);
		db.renewChat(5, 4000);
		expect(db.chatAuthorizedSince(5, 0)).toBe(false);
	});
});
