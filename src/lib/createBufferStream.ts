/* Copyright © 2023 Apeleg Limited.
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

import type { TTypedArray } from '../types/index.js';

const createBufferStream = <T extends TTypedArray | ArrayBuffer>(buffer: T) => {
	const readableStream = new ReadableStream<ArrayBuffer>({
		pull(controller) {
			if (ArrayBuffer.isView(buffer)) {
				controller.enqueue(
					buffer.buffer.slice(
						buffer.byteOffset,
						buffer.byteOffset + buffer.byteLength,
					),
				);
			} else if (buffer instanceof ArrayBuffer) {
				controller.enqueue(buffer);
			} else {
				throw new TypeError(
					'Expected ArrayBuffer or an ArrayBuffer view.',
				);
			}
			controller.close();
		},
	});
	return readableStream;
};

export default createBufferStream;
