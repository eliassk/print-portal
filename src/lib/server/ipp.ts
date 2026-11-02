// A minimal IPP client: one Get-Printer-Attributes request, read-only.
const TAG = { operation: 0x01, end: 0x03, charset: 0x47, language: 0x48, uri: 0x45, keyword: 0x44 } as const;
const COLLECTION_START = 0x34;
const COLLECTION_END = 0x37;
const MEMBER_NAME = 0x4a;

function attr(tag: number, name: string, value: string): Buffer {
	const n = Buffer.from(name);
	const v = Buffer.from(value);
	const b = Buffer.alloc(1 + 2 + n.length + 2 + v.length);
	b.writeUInt8(tag, 0);
	b.writeUInt16BE(n.length, 1);
	n.copy(b, 3);
	b.writeUInt16BE(v.length, 3 + n.length);
	v.copy(b, 5 + n.length);
	return b;
}

export function getPrinterAttributesRequest(uri: string, attrs: string[]): Buffer {
	const head = Buffer.from([0x02, 0x00, 0x00, 0x0b, 0x00, 0x00, 0x00, 0x01, TAG.operation]);
	const parts = [
		head,
		attr(TAG.charset, 'attributes-charset', 'utf-8'),
		attr(TAG.language, 'attributes-natural-language', 'en'),
		attr(TAG.uri, 'printer-uri', uri),
		...attrs.map((a, i) => attr(TAG.keyword, i === 0 ? 'requested-attributes' : '', a)),
		Buffer.from([TAG.end])
	];
	return Buffer.concat(parts);
}

export type Value = string | number | boolean | Record<string, Value[]>;

/**
 * Parses an IPP response into name → values. Collections become objects of member → values.
 * Values follow RFC 8010 by tag: integers and enums as numbers, booleans, everything else as text.
 */
export function parseResponse(buf: Uint8Array): { status: number; attrs: Record<string, Value[]> } {
	const b = Buffer.from(buf);
	const status = b.readUInt16BE(2);
	const attrs: Record<string, Value[]> = {};
	let i = 8;
	let last = '';

	function value(tag: number, v: Buffer): Value {
		if (tag === 0x21 || tag === 0x23) return v.length === 4 ? v.readInt32BE(0) : 0;
		if (tag === 0x22) return v[0] === 1;
		return v.toString('utf8');
	}

	function readOne(): { tag: number; name: string; v: Buffer } {
		const tag = b[i++];
		const nl = b.readUInt16BE(i);
		i += 2;
		const name = b.toString('utf8', i, i + nl);
		i += nl;
		const vl = b.readUInt16BE(i);
		i += 2;
		const v = b.subarray(i, i + vl);
		i += vl;
		return { tag, name, v };
	}

	function readCollection(): Record<string, Value[]> {
		const col: Record<string, Value[]> = {};
		let member = '';
		while (i < b.length) {
			const { tag, v } = readOne();
			if (tag === COLLECTION_END) return col;
			if (tag === MEMBER_NAME) {
				member = v.toString('utf8');
				continue;
			}
			(col[member] ??= []).push(tag === COLLECTION_START ? readCollection() : value(tag, v));
		}
		return col;
	}

	while (i < b.length) {
		const tag = b[i];
		if (tag <= 0x0f) {
			i++;
			if (tag === TAG.end) break;
			continue;
		}
		const { tag: t, name, v } = readOne();
		if (name) last = name;
		(attrs[last] ??= []).push(t === COLLECTION_START ? readCollection() : value(t, v));
	}
	return { status, attrs };
}
