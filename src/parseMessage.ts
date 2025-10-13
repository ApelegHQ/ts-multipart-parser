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

/**
 * Parses a single message or message part from a byte buffer into its
 * constituent headers and body.
 *
 * This function processes a `Uint8Array` representing a message, such as a
 * part from a `multipart/*` payload or a simple email-style message. It reads
 * headers line-by-line, handling multi-line header values folded with linear
 * whitespace, until it encounters the empty line (`CRLF`) that separates the
 * headers from the message body. The remainder of the buffer is returned as the
 * body.
 *
 * If a custom `headersTransform` function is not provided, default headers for
 * `Content-Type` ('text/plain; charset=us-ascii') and `Content-Transfer-Encoding`
 * ('7bit') are added if they are not already present in the parsed headers.
 *
 * @example
 * ```javascript
 * const messageString = [
 *   'Content-Type: text/plain; charset=utf-8',
 *   'X-Custom-Header: Some Value',
 *   '', // Separator line
 *   'This is the body of the message.',
 * ].join('\r\n');
 *
 * const encoder = new TextEncoder();
 * const buffer = encoder.encode(messageString);
 *
 * const { headers, body } = parseMessage(buffer);
 *
 * console.log(headers.get('content-type'));
 * if (body) {
 *   console.log(new TextDecoder().decode(body));
 * }
 *
 * // Expected output:
 * // text/plain; charset=utf-8
 * // This is the body of the message.
 * ```
 *
 * @param buffer The `Uint8Array` containing the raw message data to be parsed.
 * @param headersTransform An optional function to process the parsed headers.
 * It receives an array of header tuples (`[name, value]`) and should return a
 * standard `Headers` object. If omitted, a `Headers` object is created with
 * default `Content-Type` and `Content-Transfer-Encoding` if they are missing.
 * @returns An object containing the parsed `headers` as a `Headers` object
 * and the `body` as a `Uint8Array`. If the message ends immediately after the
 * headers, the body will be an empty `Uint8Array`. If the header/body separator
 * is not found, `body` will be `null`.
 * @throws {ParseError} Throws if a header line is encountered that does not
 * contain a colon (`:`) separator.
 */
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
