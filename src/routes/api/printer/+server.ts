import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { printerStatus } from '$lib/server/status';
import { botReady } from '$lib/server/telegram';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const status = await printerStatus(config.printerHost, config.printerIppPort);
	return json({ ...status, colorAllowed: getDb().settings().colorAllowed, pinTtlMin: config.pinTtlMin, telegram: botReady() });
};
