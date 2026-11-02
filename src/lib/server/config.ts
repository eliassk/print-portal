import { env } from '$env/dynamic/private';

function num(name: string, fallback: number): number {
	const v = Number(env[name] ?? fallback);
	if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} MUST be a positive number`);
	return v;
}

export const config = {
	printerHost: env.PRINTER_HOST ?? '10.134.13.10',
	printerPort: num('PRINTER_PORT', 9100),
	printerIppPort: num('PRINTER_IPP_PORT', 631),
	pinTtlMin: num('PIN_TTL_MIN', 60),
	maxUploadBytes: num('MAX_UPLOAD_MB', 50) * 1024 * 1024,
	maxPhotos: num('MAX_PHOTOS', 36),
	dataDir: env.DATA_DIR ?? './data',
	/** Admin page is off when no password is set. */
	adminPassword: env.ADMIN_PASSWORD ?? '',
	/** Signs admin cookies. MUST be long and random in production. */
	adminSecret: env.ADMIN_SECRET ?? '',
	/** Address printed in the QR code on the card next to the printer. */
	portalUrl: env.PORTAL_URL ?? 'http://druk.lan'
};
