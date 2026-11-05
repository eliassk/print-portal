import { posterRequest } from '$lib/server/posterRequest';
import { renderPoster } from '$lib/server/poster';
import type { RequestHandler } from './$types';

/** The printable guide for this portal, as a web page for previewing. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const { size, ...o } = posterRequest(params.size, cookies);
	return new Response(await renderPoster(size, o), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};
