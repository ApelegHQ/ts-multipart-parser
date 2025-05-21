/* Copyright © 2025 Apeleg Limited.
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import parse, {
	type TMultipartMessageGenerator,
} from '../src/parseMultipartMessage.js';

export const textDecoder = new TextDecoder();
export const textEncoder = new TextEncoder();

export const newLineToCRLF = (str: string) =>
	str.replace(/\r(?!n)|(?<!\r)\n/g, '\r\n');

export const createStringStream = (str: string, chunkSize?: number) => {
	const encoder = new TextEncoder();
	const buffer = encoder.encode(str);
	const cs = !chunkSize ? buffer.length : chunkSize;
	let pos = 0;

	const readableStream = new ReadableStream({
		pull(controller) {
			controller.enqueue(buffer.subarray(pos, pos + cs));
			pos += cs;
			if (pos >= buffer.length) {
				controller.close();
			}
		},
	});
	return readableStream;
};

export const extractParts = (
	testVector: string,
	boundary: string,
	headersTransform?: (headers: [name: string, value: string][]) => Headers,
) => {
	const result = parse(
		createStringStream(newLineToCRLF(testVector), 4),
		boundary,
		headersTransform,
	);

	const inner = async (result: TMultipartMessageGenerator): Promise<TT[]> => {
		const parts: TT[] = [];

		for await (const part of result) {
			const hh: [string, string][] = [];
			part.headers.forEach((v, k) => hh.push([k, v]));

			parts.push({
				h: Object.fromEntries(hh),
				...(part.body && { b: textDecoder.decode(part.body) }),
				...(part.parts && { p: await inner(part.parts) }),
			});
		}

		return parts;
	};

	return inner(result);
};

export type TT = {
	h: Record<string, string>;
	b?: string;
	p?: TT[];
};
