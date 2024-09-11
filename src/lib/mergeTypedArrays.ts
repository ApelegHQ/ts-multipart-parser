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

import type { TTypedArray } from '../types/index.js';

const mergeTypedArrays = <T extends TTypedArray>(
	input0: T,
	...input: T[]
): T => {
	const length = input.reduce(
		(acc, cv) => acc + cv.byteLength,
		input0.length,
	);

	const mergedArray = new (Object(input[0]).constructor)(length);
	mergedArray.set(input0);

	let offset = input0.length;
	input.forEach((item) => {
		mergedArray.set(item, offset);
		offset += item.byteLength;
	});

	return mergedArray;
};

export default mergeTypedArrays;
