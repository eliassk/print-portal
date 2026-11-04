import { describe, expect, it } from 'vitest';
import { claimDraft, getDraft, saveClaimable } from './jobs.ts';
import { openDb } from './db.ts';
import { adminConnectLink, allowFile, chatName, pickFile, useLink } from './telegram.ts';

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
		const claim = await saveClaimable({ kind: 'photo', data: [new Uint8Array([1])], items: 1 }, 'x.jpg');
		const first = claimDraft(claim, 'device-a');
		expect(first?.draft.name).toBe('x.jpg');
		expect(getDraft(first!.key, 'device-a')).not.toBeNull();
		expect(claimDraft(claim, 'device-b')).toBeNull();
		expect(getDraft(first!.key, 'device-b')).toBeNull();
	});

	it('refuses unknown or reused connect tokens', () => {
		expect(useLink('not-a-real-token')).toBeNull();
		// No bot name until the bot has started, so no link can be handed out.
		expect(adminConnectLink()).toBeNull();
	});

	it('keeps chat authorizations until they expire or are dropped', () => {
		const db = openDb(':memory:');
		db.authorizeChat(5, 7, 1000);
		expect(db.chatCustomer(5, 500)).toBe(7);
		expect(db.chatCustomer(5, 2000)).toBeNull();
		expect(db.chatCustomer(6, 0)).toBeNull();
		db.renewChat(5, 3000);
		expect(db.chatCustomer(5, 2000)).toBe(7);
		db.forgetChat(5);
		db.renewChat(5, 4000);
		expect(db.chatCustomer(5, 0)).toBeNull();
	});

	it('names a chat by person or group', () => {
		expect(chatName({ id: 1, first_name: 'Ola', last_name: 'Nowak', username: 'olan' } as never)).toBe('Ola Nowak @olan');
		expect(chatName({ id: 1, first_name: 'Jan' } as never)).toBe('Jan');
		expect(chatName({ id: -5, title: 'Recepcja' } as never)).toBe('Recepcja');
	});
});
