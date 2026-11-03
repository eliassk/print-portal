import { env } from '$env/dynamic/private';

function num(name: string, fallback: number): number {
	const v = Number(env[name] ?? fallback);
	if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} MUST be a positive number`);
	return v;
}

function required(name: string): string {
	const v = env[name]?.trim();
	if (!v) throw new Error(`${name} MUST be set, see .env.example`);
	return v;
}

export const config = {
	// Read on use, so modules that never talk to the printer load without it.
	get printerHost() {
		return required('PRINTER_HOST');
	},
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
	portalUrl: env.PORTAL_URL ?? env.ORIGIN ?? 'http://localhost:3000',
	/** Telegram bot that turns sent files into portal links. Off when empty. */
	telegramToken: env.TELEGRAM_BOT_TOKEN ?? '',
	/** Times in bot messages. The container itself often runs in UTC. */
	timeZone: env.PORTAL_TZ ?? 'Europe/Warsaw'
};
