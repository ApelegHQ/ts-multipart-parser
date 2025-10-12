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

const { encodeMultipartMessage, EncodeError } = require('../../dist/index.cjs');
const headersTransform = require('./headersTransform.cjs');

/**
 * @param {Buffer} buf
 * @returns {Promise<void>}
 */
async function fuzz(buf) {
	if (buf.length < 1) return;

	const slice = (start, len) =>
		buf.slice(
			start % Math.max(1, buf.length),
			Math.min(buf.length, (start % Math.max(1, buf.length)) + len),
		);
	const asStr = (b) => b.toString('utf8').replace(/\0/g, '') || 'x';
	const randomBoundary = () => {
		const a = asStr(slice(0, Math.max(1, buf[0] || 4)));
		const b = asStr(slice(1, Math.max(1, buf[1] || 4)));
		return `${a}-${b}-${Math.floor((buf[2] || 1) * 1000)}`;
	};

	async function* messages() {
		const count = 1 + ((buf[3] || 0) % 6); // 1..6 messages
		for (let m = 0; m < count; m++) {
			const kind = (buf[4 + m] || 0) % 3;
			if (kind === 0) {
				// headers only
				yield {
					headers: headersTransform([
						['X', asStr(slice(10 + m * 4, 8))],
					]),
				};
			} else if (kind === 1) {
				// body as ArrayBuffer
				const b = slice(20 + m * 16, Math.min(128, buf.length));
				yield {
					headers: headersTransform([['C', 'b']]),
					body: b.buffer.slice(
						b.byteOffset,
						b.byteOffset + b.byteLength,
					),
				};
			} else {
				// parts (single nested part) to keep it tiny
				const sub = {
					headers: headersTransform([['S', String(m)]]),
					body: slice(40 + m * 8, 16).buffer.slice(0),
				};
				yield { parts: [sub] };
			}
		}
	}

	try {
		const boundary = randomBoundary();
		const rs = encodeMultipartMessage(boundary, messages());
		const reader = rs.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			// quick touch to avoid optimizations
			if (value && value.byteLength === 0) {
				/* no-op */
			}
		}
	} catch (e) {
		if (!(e instanceof EncodeError)) {
			throw e;
		}
	}
}

module.exports = { fuzz };
