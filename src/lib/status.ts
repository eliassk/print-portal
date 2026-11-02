/** What the page and the admin view show about the printer. Client-safe. */
export type TrayState = 'full' | 'ok' | 'low' | 'empty' | 'unknown';

export interface Tray {
	key: 'bypass' | 'tray1' | 'tray2' | 'tray3';
	/** ISO size name, e.g. "A4", or null when unknown. */
	size: string | null;
	/** Fill level 0–100, or null when unknown. */
	level: number | null;
	state: TrayState;
}

export interface Toner {
	key: 'black' | 'cyan' | 'magenta' | 'yellow';
	level: number;
}

export interface PrinterStatus {
	online: boolean;
	trays: Tray[];
	toner: Toner[];
	lowPaper: boolean;
	checkedAt: number;
}
