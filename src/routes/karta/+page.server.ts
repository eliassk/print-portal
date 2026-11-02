import QRCode from 'qrcode';
import { config } from '$lib/server/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	url: config.portalUrl,
	qr: await QRCode.toString(config.portalUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
});
