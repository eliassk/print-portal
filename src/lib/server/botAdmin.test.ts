import { describe, expect, it } from 'vitest';
import { adminCommand } from './botAdmin.ts';
import { openDb } from './db.ts';

const TZ = 'Europe/Warsaw';
const NOW = Date.UTC(2026, 10, 4, 12);
const text = (r: ReturnType<typeof adminCommand>) => (r && 'text' in r ? r.text : '');

describe('adminCommand', () => {
	it('ignores anything that is not an admin command', () => {
		const db = openDb(':memory:');
		expect(adminCommand('hello', db, TZ, NOW)).toBeNull();
		expect(adminCommand('/nope', db, TZ, NOW)).toBeNull();
	});

	it('adds a customer with a six-digit code and an end date', () => {
		const db = openDb(':memory:');
		const r = text(adminCommand('/dodaj Kancelaria Nowak 2026-12-31', db, TZ, NOW));
		const [c] = db.customers();
		expect(c).toMatchObject({ name: 'Kancelaria Nowak', enabled: true, activeFrom: null, activeUntil: '2026-12-31' });
		expect(c.code).toMatch(/^\d{6}$/);
		expect(r).toContain(c.code);
	});

	it('reads two dates as start and end, and refuses a missing name', () => {
		const db = openDb(':memory:');
		adminCommand('/add@PortalBot Studio 2026-12-01 2027-01-31', db, TZ, NOW);
		expect(db.customers()[0]).toMatchObject({ name: 'Studio', activeFrom: '2026-12-01', activeUntil: '2027-01-31' });
		adminCommand('/add 2026-12-01', db, TZ, NOW);
		expect(db.customers()).toHaveLength(1);
	});

	it('switches a customer off and on by code', () => {
		const db = openDb(':memory:');
		db.addCustomer({ name: 'A', code: '123456', enabled: true, activeFrom: null, activeUntil: null, networks: '' });
		adminCommand('/wylacz 123 456', db, TZ, NOW);
		expect(db.customerByCode('123456')?.enabled).toBe(false);
		adminCommand('/on 123456', db, TZ, NOW);
		expect(db.customerByCode('123456')?.enabled).toBe(true);
	});

	it('reports a month per customer and sends the CSV', () => {
		const db = openDb(':memory:');
		const id = db.addCustomer({ name: 'A', code: '111111', enabled: true, activeFrom: null, activeUntil: null, networks: '' });
		const job = (at: number, color: string) =>
			db.addJob({ at, jobId: '1', device: 'd', sheets: 2, sides: 4, size: 'A4', paper: 'plain', color, expires: at, customerId: id, duplex: 'long' });
		job(Date.UTC(2026, 10, 2), 'color');
		job(Date.UTC(2026, 9, 15), 'mono');
		expect(text(adminCommand('/stats', db, TZ, NOW))).toContain('A: 4');
		expect(text(adminCommand('/statystyki poprzedni', db, TZ, NOW))).toMatch(/A: 4 .*0.*4/);
		expect(text(adminCommand('/stats 2026-13', db, TZ, NOW))).not.toContain('A:');
		const csv = adminCommand('/csv 2026-10', db, TZ, NOW);
		expect(csv && 'document' in csv && csv.document.name).toBe('billing-2026-10.csv');
		expect(csv && 'document' in csv && csv.document.data.split('\r\n')).toHaveLength(3);
	});
});
