import { randomInt } from 'node:crypto';

/** A tenant of the building. Its code unlocks the portal and the Telegram bot. */
export interface Customer {
	id: number;
	name: string;
	code: string;
	enabled: boolean;
	/** First day the code works, YYYY-MM-DD. Null means no start limit. */
	activeFrom: string | null;
	/** Last day the code works, inclusive. Null means no end. */
	activeUntil: string | null;
	/** IPv4 ranges in CIDR form, one per line. Requests from them sign in as this customer without a code. */
	networks: string;
}

/** Digits only, so phones show the number pad. No leading zero, so spreadsheets keep it intact. */
export const newCode = (length = 6) => String(randomInt(10 ** (length - 1), 10 ** length));

/** Codes are compared without case, spaces or dashes. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');

/** Today in the building's time zone, as YYYY-MM-DD. */
export const today = (timeZone: string, now = Date.now()) => new Date(now).toLocaleDateString('sv-SE', { timeZone });

export function isActive(c: Pick<Customer, 'enabled' | 'activeFrom' | 'activeUntil'>, day: string): boolean {
	if (!c.enabled) return false;
	if (c.activeFrom && day < c.activeFrom) return false;
	if (c.activeUntil && day > c.activeUntil) return false;
	return true;
}

/** A YYYY-MM-DD date from a form field, or null when empty or malformed. */
export const parseDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The IPv4 address as a number, also from an IPv4-mapped IPv6 address. Null for anything else. */
function ipv4(ip: string): number | null {
	const m = ip.replace(/^::ffff:/i, '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const parts = m.slice(1).map(Number);
	if (parts.some((p) => p > 255)) return null;
	return parts.reduce((n, p) => n * 256 + p, 0);
}

/** Valid CIDR lines from a text field. A bare address counts as /32. */
export function parseNetworks(text: string): string[] {
	return text
		.split(/[\s,]+/)
		.filter(Boolean)
		.filter((n) => {
			const [ip, bits = '32'] = n.split('/');
			return ipv4(ip) !== null && /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
		});
}

export function inNetworks(ip: string, networks: string): boolean {
	const addr = ipv4(ip);
	if (addr === null) return false;
	return parseNetworks(networks).some((n) => {
		const [base, bits = '32'] = n.split('/');
		const size = 2 ** (32 - Number(bits));
		return Math.floor(addr / size) === Math.floor(ipv4(base)! / size);
	});
}

/**
 * The active customer for a request: the one whose code the browser saved,
 * otherwise one whose networks hold the client address.
 */
export function resolveCustomer(all: Customer[], code: string | undefined, ip: string, day: string): Customer | null {
	const active = all.filter((c) => isActive(c, day));
	const byCode = code ? active.find((c) => c.code === code) : undefined;
	return byCode ?? active.find((c) => inNetworks(ip, c.networks)) ?? null;
}
