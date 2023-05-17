/* Copyright © 2023 Exact Realty Limited.
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

// Helper function to find the index of a Uint8Array within another Uint8Array
const findIndex = <T extends TTypedArray>(buffer: T, delimiter: T): number => {
	outerLoop: for (let i = 0; i <= buffer.length - delimiter.length; i++) {
		for (let j = 0; j < delimiter.length; j++) {
			if (buffer[i + j] !== delimiter[j]) {
				continue outerLoop;
			}
		}
		return i;
	}
	return -1;
};

export default findIndex;
