import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;

/** A signed admin token: "<expiry>.<hmac>". The secret MUST come from the environment. */
export function signAdmin(secret: string, now = Date.now()): string {
	const exp = String(now + 12 * 60 * 60 * 1000);
	return `${exp}.${createHmac('sha256', secret).update(exp).digest('base64url')}`;
}

export function verifyAdmin(secret: string, token: string | undefined, now = Date.now()): boolean {
	if (!token) return false;
	const [exp, sig] = token.split('.');
	if (!exp || !sig || Number(exp) < now || Number(exp) > now + DAY) return false;
	const want = createHmac('sha256', secret).update(exp).digest();
	const got = Buffer.from(sig, 'base64url');
	return got.length === want.length && timingSafeEqual(got, want);
}

export function passwordMatches(given: string, expected: string): boolean {
	const a = createHmac('sha256', 'cmp').update(given).digest();
	const b = createHmac('sha256', 'cmp').update(expected).digest();
	return timingSafeEqual(a, b);
}

/** A random id for the browser, so daily limits count per device. */
export const newDeviceId = () => randomBytes(16).toString('base64url');
