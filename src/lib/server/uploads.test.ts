import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// A data folder of its own, so the test never touches ./data.
const data = mkdtempSync(join(tmpdir(), 'portal-test-'));
vi.mock('./config.ts', () => ({ config: { dataDir: data } }));
const { removeOrphans, saveDraft } = await import('./jobs.ts');

describe('removeOrphans', () => {
	it('deletes files left from before a restart and keeps live drafts', async () => {
		const uploads = join(data, 'uploads');
		await mkdir(uploads, { recursive: true });
		const stray = join(uploads, 'old-draft-0');
		await writeFile(stray, 'secret');
		await saveDraft({ kind: 'doc', data: [new Uint8Array([1])], items: 1 }, { device: 'd' });

		expect(await removeOrphans()).toBe(1);
		expect(existsSync(stray)).toBe(false);
		expect(readdirSync(uploads)).toHaveLength(1);
	});
});
