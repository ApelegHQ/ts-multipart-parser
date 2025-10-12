/* Copyright © 2025 Apeleg Limited. All rights reserved.
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

const { TrappedHeadersError, trapHeaders } = require('./trapHeaders.cjs');
const headersTransform = require('./headersTransform.cjs');

const { parseMultipartMessage, ParseError } = require('../../dist/index.cjs');

const createStream = (buffer, chunkSize) => {
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

trapHeaders();

/**
 * @param {Buffer} buf
 * @returns {Promise<void>}
 */
async function fuzz(buf) {
	if (buf.length < 1) return;

	const noHeaderTransform = !!(buf[0] & 0b01);

	const boundary =
		buf
			.subarray(1, buf.indexOf(0))
			.toString('ascii')
			.replace(/[^0-9a-zA-Z'()+_,\-./:=? ]/, '')
			.slice(70)
			.split('')
			.reverse()
			.join('')
			.replace(/[ ]$/, '-') ||
		String.fromCharCode((buf[1] & 0b0111) | 0b0100_1000);

	try {
		const result = parseMultipartMessage(
			createStream(
				buf.subarray(1),
				((0, Math.random)() * buf.length) >>> 0,
			),
			boundary,
			noHeaderTransform ? undefined : headersTransform,
		);

		for await (const part of result) {
			void part;
		}
	} catch (e) {
		if (e instanceof ParseError) {
			return;
		}
		if (
			noHeaderTransform &&
			e instanceof TrappedHeadersError &&
			e.cause instanceof TypeError
		) {
			return;
		}
		throw e;
	}
}

module.exports = { fuzz };
