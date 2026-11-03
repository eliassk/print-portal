import { ui } from '$lib/i18n';

/** A refused request, with the message the server gave. */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/**
 * Calls a portal endpoint and returns its JSON. `json` is sent as a JSON body, `form` as form data.
 * Throws ApiError with the server's message, or the generic one when there is none.
 */
export async function api<T>(url: string, { method = 'POST', json, form }: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: json === undefined ? undefined : { 'content-type': 'application/json' },
		body: json === undefined ? form : JSON.stringify(json)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(data.error ?? ui.errors.generic, res.status);
	return data as T;
}

/** The text to show for anything a call threw. */
export const message = (e: unknown) => (e instanceof Error && e.message ? e.message : ui.errors.generic);
