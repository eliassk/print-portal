import { describe, expect, it } from 'vitest';
import { inNetworks, isActive, resolveCustomer, newCode, normalizeCode, parseNetworks, today } from './customers.ts';
import { openDb } from './db.ts';

const c = { enabled: true, activeFrom: '2026-11-01', activeUntil: '2026-11-30' };

describe('isActive', () => {
	it('is active inside the range, both ends included', () => {
		expect(isActive(c, '2026-11-01')).toBe(true);
		expect(isActive(c, '2026-11-30')).toBe(true);
	});
	it('is inactive outside the range', () => {
		expect(isActive(c, '2026-10-31')).toBe(false);
		expect(isActive(c, '2026-12-01')).toBe(false);
	});
	it('is inactive when switched off', () => expect(isActive({ ...c, enabled: false }, '2026-11-10')).toBe(false));
	it('has no limits without dates', () => expect(isActive({ enabled: true, activeFrom: null, activeUntil: null }, '2099-01-01')).toBe(true));
});

describe('codes', () => {
	it('ignores case, spaces and dashes', () => expect(normalizeCode(' ab-cd 12 ')).toBe('ABCD12'));
	it('makes six-digit codes', () => expect(newCode()).toMatch(/^[1-9]\d{5}$/));
	it('reads the day in the given time zone', () => expect(today('Europe/Warsaw', Date.UTC(2026, 10, 3, 23, 30))).toBe('2026-11-04'));
});

describe('networks', () => {
	it('matches addresses inside a range', () => {
		expect(inNetworks('10.20.5.7', '10.20.0.0/16')).toBe(true);
		expect(inNetworks('::ffff:10.20.5.7', '192.168.1.0/24\n10.20.0.0/16')).toBe(true);
		expect(inNetworks('10.21.0.1', '10.20.0.0/16')).toBe(false);
		expect(inNetworks('192.168.1.9', '192.168.1.9')).toBe(true);
	});
	it('ignores malformed lines and IPv6 clients', () => {
		expect(parseNetworks('10.0.0.0/8 nonsense 300.1.1.1 1.2.3.4/40')).toEqual(['10.0.0.0/8']);
		expect(inNetworks('fe80::1', '0.0.0.0/0')).toBe(false);
	});
});

describe('customers in the database', () => {
	it('finds a customer by code and links Telegram chats to it', () => {
		const db = openDb(':memory:');
		const id = db.addCustomer({ name: 'Firma A', code: 'ABC234', enabled: true, activeFrom: null, activeUntil: null, networks: '' });
		expect(db.customerByCode('ABC234')?.name).toBe('Firma A');
		db.authorizeChat(42, id, 1000);
		expect(db.chatCustomer(42, 0)).toBe(id);
		db.deleteCustomer(id);
		expect(db.customerByCode('ABC234')).toBeNull();
		expect(db.chatCustomer(42, 0)).toBeNull();
	});
});

describe('resolveCustomer', () => {
	const base = { enabled: true, activeFrom: null, activeUntil: null, networks: '' };
	const all = [
		{ ...base, id: 1, name: 'Office', code: 'INT', networks: '10.0.0.0/8' },
		{ ...base, id: 2, name: 'Tenant', code: 'TEN' },
		{ ...base, id: 3, name: 'Gone', code: 'OLD', activeUntil: '2026-01-31' }
	];
	it('prefers the saved code', () => expect(resolveCustomer(all, 'TEN', '10.1.1.1', '2026-11-04')?.id).toBe(2));
	it('falls back to the network', () => expect(resolveCustomer(all, undefined, '10.1.1.1', '2026-11-04')?.id).toBe(1));
	it('refuses an inactive code', () => expect(resolveCustomer(all, 'OLD', '192.168.0.5', '2026-11-04')).toBeNull());
});
