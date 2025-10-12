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

function fuzzFactory(require, pre, post) {
	/**
	 * @param {Buffer} buf
	 * @returns {Promise<void>}
	 */
	return async function (buf) {
		if (buf.length < 1) return;

		pre?.(buf);

		// This line for coverage purposes (use all getters)
		void { ...require('../../dist/index.cjs') };

		const {
			fuzz: encodeMultipartMessage,
		} = require('./encodeMultipartMessage.cjs');
		const { fuzz: parseMessage } = require('./parseMessage.cjs');
		const {
			fuzz: parseMultipartMessage,
		} = require('./parseMultipartMessage.cjs');

		switch (buf[0] & 0b1100_0000) {
			case 0b0000_0000:
				await encodeMultipartMessage(buf);
				break;
			case 0b0100_0000:
				await parseMessage(buf);
				break;
			case 0b1000_0000:
				await parseMultipartMessage(buf);
				break;
		}

		post?.(buf);
	};
}

module.exports = fuzzFactory;
