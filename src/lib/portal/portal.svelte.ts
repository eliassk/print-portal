import { api, ApiError, message } from '$lib/api';
import { ui } from '$lib/i18n';
import { normalize, PRESETS, type Kind, type PrintOptions } from '$lib/options';
import { parseRange } from '$lib/pages';
import type { PrinterStatus } from '$lib/status';
import { trayFor } from '$lib/trayFor';

export type Screen = 'start' | 'file' | 'opts' | 'sum' | 'pin';
export const SCREENS: Screen[] = ['start', 'file', 'opts', 'sum', 'pin'];
export const BACK: Partial<Record<Screen, Screen>> = { file: 'start', opts: 'file', sum: 'opts' };

type Status = PrinterStatus & { colorAllowed: boolean; pinTtlMin: number; telegram?: boolean };
type Preview = { image: string; faces: number; sheets: number; lowRes: boolean };
type Result = { id: string; pin: string; expires: number; sheets: number; telegram?: boolean };
export type Pick = { sheets: { name: string; range: string }[]; fit: boolean };
type Book = { list: { name: string; range: string | null }[]; pick: Pick };
/** What the server returns for an uploaded or claimed file. */
type Opened = { draft: string; kind: Kind; items: number; sheets?: Book; name?: string; size?: PrintOptions['size'] };
/** `code` is false when the person was signed in by their network and has no code to drop. */
type Customer = { name: string; code: boolean };

/** Everything the print page knows, shared by its screens. */
export class Portal {
	/** Undefined while loading. Nothing else is shown until a customer is known. */
	customer = $state<Customer | null | undefined>(undefined);
	/** False when the admin turned customer codes off; then nobody is asked for one. */
	required = $state(true);
	/** Whether printing is open: a customer is known, or none is needed. */
	canPrint = $derived(!!this.customer || (this.customer === null && !this.required));
	/** A Telegram file link opened before the code was entered. */
	private pendingClaim: string | null = null;
	screen = $state<Screen>('start');
	kind = $state<Kind>('doc');
	opts = $state<PrintOptions>({ ...PRESETS.doc });
	fileName = $state('');
	draft = $state<string | null>(null);
	items = $state(0);
	busy = $state(false);
	error = $state('');
	printer = $state<Status | null>(null);
	preview = $state<Preview | null>(null);
	/** Preview sheet shown, 1-based. */
	sheet = $state(1);
	previewBusy = $state(false);
	result = $state<Result | null>(null);
	/** Spreadsheets only: the sheets in the file and the choice the current PDF was made from. */
	book = $state<Book | null>(null);
	picks = $state<{ name: string; on: boolean; range: string }[]>([]);
	fitWide = $state(true);
	bookBusy = $state(false);
	/** Bumped when the draft's PDF changes, so the preview renders again. */
	revision = $state(0);

	effective = $derived(normalize(this.opts, this.kind));
	rangeOk = $derived(this.kind === 'photo' || parseRange(this.opts.range, this.items) !== null);
	tray = $derived(trayFor(this.effective, this.printer));
	pickNow = $derived<Pick>({ sheets: this.picks.filter((p) => p.on).map(({ name, range }) => ({ name, range: range.trim() })), fit: this.fitWide });
	pickDirty = $derived(!!this.book && JSON.stringify(this.pickNow) !== JSON.stringify(this.book.pick));

	/** Runs a call with `busy` set, and shows its error. */
	private async run(flag: 'busy' | 'bookBusy', fn: () => Promise<void>) {
		this.error = '';
		this[flag] = true;
		try {
			await fn();
		} catch (e) {
			// The customer was switched off or its dates ran out while the page was open.
			if (e instanceof ApiError && e.status === 401) {
				this.customer = null;
				this.required = true;
			}
			this.error = message(e);
		} finally {
			this[flag] = false;
		}
	}

	async loadCustomer() {
		try {
			const r = await api<{ customer: Customer | null; required: boolean }>('/api/customer', { method: 'GET' });
			this.required = r.required;
			this.customer = r.customer;
		} catch {
			this.customer = null;
		}
		this.openPendingClaim();
	}

	enterCode(code: string) {
		return this.run('busy', async () => {
			this.customer = (await api<{ customer: Customer }>('/api/customer', { json: { code } })).customer;
			this.openPendingClaim();
		});
	}

	async signOut() {
		await api('/api/customer', { method: 'DELETE' }).catch(() => {});
		this.restart();
		await this.loadCustomer();
	}

	private openPendingClaim() {
		const claim = this.pendingClaim;
		if (!claim || !this.canPrint) return;
		this.pendingClaim = null;
		void this.openClaim(claim);
	}

	async loadPrinter() {
		try {
			this.printer = await api<Status>('/api/printer', { method: 'GET' });
		} catch {
			this.printer = null;
		}
	}

	choose(k: Kind) {
		this.kind = k;
		this.opts = { ...PRESETS[k] };
		if (this.printer && !this.printer.colorAllowed) this.opts.color = 'mono';
		this.error = '';
		this.screen = 'file';
	}

	/** Shows a file the server has accepted. A claimed file always starts from its kind's preset. */
	private open(d: Opened, fresh = d.kind !== this.kind) {
		if (fresh) this.choose(d.kind);
		if (d.size) this.opts.size = d.size;
		this.draft = d.draft;
		this.items = d.items;
		if (d.name) this.fileName = d.name;
		this.setBook(d.sheets ?? null);
		this.preview = null;
		this.sheet = 1;
		this.screen = 'opts';
	}

	uploadFiles(files: File[]) {
		if (files.length === 0) return;
		this.fileName = files.length === 1 ? files[0].name : ui.photos(files.length);
		const form = new FormData();
		for (const f of files) form.append('file', f);
		return this.run('busy', async () => this.open(await api<Opened>('/api/upload', { form })));
	}

	/** A file sent to the Telegram bot: its link carries a one-time token. */
	openClaim(claim: string) {
		if (!this.canPrint) {
			this.pendingClaim = claim;
			return;
		}
		return this.run('busy', async () => this.open(await api<Opened>(`/api/claim/${encodeURIComponent(claim)}`), true));
	}

	async renderPreview(body: string, page: number) {
		if (!this.draft) return;
		this.previewBusy = true;
		try {
			const data = await api<Preview>(`/api/preview/${this.draft}?sheet=${page}`, { json: JSON.parse(body) });
			this.preview = data;
			if (this.sheet > data.faces) this.sheet = data.faces;
			this.error = '';
		} catch (e) {
			this.error = message(e);
		} finally {
			this.previewBusy = false;
		}
	}

	setBook(b: Book | null) {
		this.book = b;
		if (!b) return;
		this.picks = b.list.map((s) => {
			const p = b.pick.sheets.find((x) => x.name === s.name);
			return { name: s.name, on: !!p, range: p?.range ?? s.range ?? '' };
		});
		this.fitWide = b.pick.fit;
	}

	applySheets() {
		const { draft, book } = this;
		if (!draft || !book) return;
		return this.run('bookBusy', async () => {
			const data = await api<{ items: number; pick: Pick }>(`/api/sheets/${draft}`, { json: this.pickNow });
			this.items = data.items;
			book.pick = data.pick;
			this.opts.range = '';
			this.sheet = 1;
			this.revision++;
		});
	}

	send() {
		const draft = this.draft;
		if (!draft) return;
		return this.run('busy', async () => {
			try {
				this.result = await api<Result>(`/api/print/${draft}`, { json: this.effective });
			} catch (e) {
				// 404 means the draft expired; it MUST NOT be sent again.
				if (e instanceof ApiError && e.status === 404) this.draft = null;
				throw e;
			}
			this.draft = null;
			this.screen = 'pin';
		});
	}

	restart() {
		this.result = null;
		this.preview = null;
		this.fileName = '';
		this.items = 0;
		this.book = null;
		this.error = '';
		this.screen = 'start';
	}
}
