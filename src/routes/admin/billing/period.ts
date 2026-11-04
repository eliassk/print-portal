import { addDays, dayStart, months } from '$lib/server/billing';
import { config } from '$lib/server/config';
import { parseDay, today } from '$lib/server/customers';

/** The period from ?from=&to=, both days included. Defaults to this month; a reversed range is swapped. */
export function period(url: URL) {
	const m = months(today(config.timeZone));
	let from = parseDay(url.searchParams.get('from')) ?? m.current.from;
	let to = parseDay(url.searchParams.get('to')) ?? m.current.to;
	if (from > to) [from, to] = [to, from];
	return { from, to, start: dayStart(from, config.timeZone), end: dayStart(addDays(to, 1), config.timeZone), months: m };
}
