import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { dataRange, normalizeRange, prepareBook, readBook, readGrid } from './workbook.ts';

const sheet = (body: string, tail = '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>') =>
	`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData>${tail}</worksheet>`;

function book(sheets: { name: string; xml: string; state?: string }[], extra = '') {
	const wb = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets>${sheets
		.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`)
		.join('')}</sheets>${extra}</workbook>`;
	const rels = `<Relationships>${sheets
		.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
		.join('')}</Relationships>`;
	const files: Record<string, Uint8Array> = { 'xl/workbook.xml': strToU8(wb), 'xl/_rels/workbook.xml.rels': strToU8(rels) };
	sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml)));
	return zipSync(files);
}

const read = (xlsx: Uint8Array, path: string) => strFromU8(unzipSync(xlsx)[path]);

const data = sheet('<row r="1"><c r="B2"><v>1</v></c><c r="F9" t="s"><v>0</v></c></row><row r="400"><c r="Z400" s="3"/></row>');

describe('workbook', () => {
	it('finds the data range and ignores formatted empty cells', () => {
		expect(dataRange(data)).toBe('B2:F9');
		expect(dataRange(sheet('<row r="1"><c r="A1" s="1"/></row>'))).toBeNull();
	});

	it('normalizes ranges', () => {
		expect(normalizeRange(' f30:a1 ')).toBe('$A$1:$F$30');
		expect(normalizeRange('C3')).toBe('$C$3:$C$3');
		expect(normalizeRange('A1:B')).toBeNull();
		expect(normalizeRange('Arkusz1!A1')).toBeNull();
	});

	it('lists visible sheets and the active one', () => {
		const b = readBook(book([{ name: 'Ukryty', xml: data, state: 'hidden' }, { name: 'Faktury &amp; koszty', xml: data }, { name: 'Pusty', xml: sheet('') }]));
		expect(b.sheets).toEqual([
			{ name: 'Faktury & koszty', range: 'B2:F9' },
			{ name: 'Pusty', range: null }
		]);
		expect(b.active).toBe(0);
	});

	it('hides unpicked sheets and sets the print area', () => {
		const src = book([{ name: 'A', xml: data }, { name: "Jan's", xml: data }], '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="1">x</definedName></definedNames>');
		const out = prepareBook(src, { sheets: [{ name: "Jan's", range: 'b2:c5' }], fit: false });
		const wb = read(out, 'xl/workbook.xml');
		expect(wb).toContain('<sheet name="A" sheetId="1" r:id="rId1" state="hidden"/>');
		expect(wb).toContain(`<definedName name="_xlnm.Print_Area" localSheetId="1">'Jan''s'!$B$2:$C$5</definedName>`);
		expect(wb).not.toContain('>x<');
		expect(wb).toContain('activeTab="1"');
	});

	it('fits a sheet to one page across', () => {
		const out = prepareBook(book([{ name: 'A', xml: data }]), { sheets: [{ name: 'A', range: '' }], fit: true }, 'landscape');
		const xml = read(out, 'xl/worksheets/sheet1.xml');
		expect(xml).toMatch(/<worksheet[^>]*><sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr><sheetData>/);
		expect(xml).toContain('/><pageSetup fitToWidth="1" fitToHeight="0" orientation="landscape"/></worksheet>');
		expect(read(out, 'xl/workbook.xml')).not.toContain('definedName');
	});

	it('updates an existing page setup', () => {
		const xml = sheet('', '<pageMargins/><pageSetup paperSize="9" scale="40" orientation="portrait"/><drawing r:id="d"/>');
		const out = read(prepareBook(book([{ name: 'A', xml }]), { sheets: [{ name: 'A', range: '' }], fit: true }), 'xl/worksheets/sheet1.xml');
		expect(out).toContain('<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>');
	});

	it('refuses unknown sheets and bad ranges', () => {
		const src = book([{ name: 'A', xml: data }]);
		expect(() => prepareBook(src, { sheets: [{ name: 'B', range: '' }], fit: true })).toThrow(RangeError);
		expect(() => prepareBook(src, { sheets: [{ name: 'A', range: 'abc' }], fit: true })).toThrow(RangeError);
	});
});

describe('readGrid', () => {
	it('reads shared, inline and number cells from A1', () => {
		const xlsx = book([{ name: 'A', xml: sheet('<row r="2"><c r="B2" t="s"><v>1</v></c><c r="C3" t="inlineStr"><is><t>x &amp; y</t></is></c><c r="A3"><f>1/3</f><v>0.33333333333333331</v></c></row>') }]);
		const files = unzipSync(xlsx);
		files['xl/sharedStrings.xml'] = strToU8('<sst><si><t>zero</t></si><si><r><t>Sprzą</t></r><r><t>tanie</t></r></si></sst>');
		const g = readGrid(zipSync(files), 'A');
		expect(g).toMatchObject({ cols: 3, rows: 3, clipped: false });
		expect(g.cells[1][1]).toBe('Sprzątanie');
		expect(g.cells[2]).toEqual(['0.3333333333', '', 'x & y']);
		expect(() => readGrid(xlsx, 'nope')).toThrow(RangeError);
	});

	it('shows date cells as dates', () => {
		const xlsx = book([{ name: 'A', xml: sheet('<row r="1"><c r="A1" s="1"><v>45984</v></c><c r="B1" s="2"><v>45984.5</v></c><c r="C1" s="3"><v>0.25</v></c><c r="D1"><v>45984</v></c></row>') }]);
		const files = unzipSync(xlsx);
		files['xl/styles.xml'] = strToU8('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/><numFmt numFmtId="165" formatCode="[h]:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>');
		expect(readGrid(zipSync(files), 'A').cells[0]).toEqual(['23.11.2025', '23.11.2025 12:00', '06:00', '45984']);
	});
});
