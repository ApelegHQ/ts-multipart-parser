/* Copyright © 2023 Apeleg Limited.
 *
 * All rights reserved.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import findIndex from './lib/findIndex.js';
import isLWSP from './lib/isLWSP.js';
import ParseError from './lib/ParseError.js';

const textDecoder = new TextDecoder();

const newline = [0x0d, 0x0a]; // '\r\n'

export type TMessage = {
	headers: Headers;
	body: Uint8Array | null;
};

const parseMessage = (
	buffer: Uint8Array,
	headersTransform?: (headers: [name: string, value: string][]) => Headers,
): TMessage => {
	let nextIndex = 0;

	const headersArray: [string, string][] = [];

	// Process headers
	while ((nextIndex = findIndex(buffer, newline)) !== -1) {
		if (nextIndex === 0) break;

		const sep = buffer.indexOf(0x3a);
		if (sep === -1) {
			throw new ParseError('Invalid header');
		}

		const name = textDecoder.decode(buffer.subarray(0, sep));

		// Multi-line headers
		while (isLWSP(buffer[nextIndex + 2])) {
			const nl = findIndex(buffer.subarray(nextIndex + 2), newline);
			if (nl < 1) {
				break;
			} else {
				nextIndex += 2 + nl;
			}
		}

		const value = textDecoder
			.decode(buffer.subarray(sep + 1, nextIndex))
			.replace(/\r\n/g, '');

		headersArray.push([name, value]);

		buffer = buffer.subarray(nextIndex + newline.length);
	}

	const headers = headersTransform
		? headersTransform(headersArray)
		: (() => {
				const headers = new Headers(headersArray);
				if (!headers.has('content-transfer-encoding')) {
					headers.set('content-transfer-encoding', '7bit');
				}
				if (!headers.has('content-type')) {
					headers.set('content-type', 'text/plain; charset=us-ascii');
				}
				return headers;
			})();

	return {
		headers: headers,
		body:
			nextIndex === -1
				? null
				: buffer.subarray(nextIndex + newline.length),
	};
};

export default parseMessage;
