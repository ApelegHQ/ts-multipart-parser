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

import { boundaryMatchRegex, boundaryRegex } from './lib/boundaryRegex.js';
import createBufferStream from './lib/createBufferStream.js';
import findIndex from './lib/findIndex.js';
import mergeTypedArrays from './lib/mergeTypedArrays.js';
import parseMessage from './parseMessage.js';
import type { TTypedArray } from './types/index.js';

enum EState {
	PREAMBLE,
	BODY_PART,
	ENCAPSULATION,
	EPILOGUE,
}

const textEncoder = new TextEncoder();

const newline = textEncoder.encode('\r\n');
const LWSPchar = [0x09, 0x20];

export type TMultipartMessage = {
	headers: Headers;
	body?: Uint8Array | null;
	parts?: TMultipartMessageGenerator | null;
};
export type TMultipartMessageGenerator = AsyncGenerator<TMultipartMessage>;

async function* parseMultipartMessage<T extends TTypedArray | ArrayBuffer>(
	stream: ReadableStream<T>,
	boundary: string,
): TMultipartMessageGenerator {
	if (!boundaryRegex.test(boundary)) {
		throw new Error('Invalid boundary delimiter');
	}

	const boundaryDelimiter = textEncoder.encode(`\r\n--${boundary}`);

	let buffer = new Uint8Array();
	let state: EState = EState.PREAMBLE;

	const reader = stream.getReader();

	try {
		while (state !== EState.EPILOGUE) {
			const { done, value } = await reader.read();

			if (!done) {
				buffer = mergeTypedArrays(
					buffer,
					ArrayBuffer.isView(value)
						? new Uint8Array(
								value.buffer,
								value.byteOffset,
								value.byteLength,
							)
						: new Uint8Array(value),
				);
			}

			while (buffer.length) {
				let boundaryIndex: number = NaN;

				if (state === EState.PREAMBLE) {
					// Special handling of empty preamble
					boundaryIndex =
						findIndex(buffer, boundaryDelimiter.slice(2)) - 2;

					if (boundaryIndex === -3) {
						// If the boundary isn't found in the current buffer, we
						// need to read more data
						break;
					}
				}

				if (boundaryIndex !== -2) {
					boundaryIndex = findIndex(buffer, boundaryDelimiter);
				}

				if (boundaryIndex === -1) {
					// If the boundary isn't found in the current buffer, we need to read more data
					break;
				}

				// Check if the boundary is followed by a newline
				const nextIndex = boundaryIndex + boundaryDelimiter.length;
				// Transport padding
				// Maximum acceptable transport padding
				// set to 32 bytes
				const nextIndexCRLF = findIndex(
					buffer.subarray(nextIndex, nextIndex + 32),
					newline,
				);

				if (!done) {
					if (
						nextIndexCRLF === -1 &&
						buffer.length - nextIndex < 32
					) {
						break;
					}

					if (
						nextIndexCRLF === -1 ||
						!Array.from(
							buffer.subarray(
								nextIndex + Math.min(2, nextIndexCRLF),
								nextIndex + nextIndexCRLF,
							),
						).every((v) => LWSPchar.includes(v))
					) {
						console.error({
							b: Buffer.from(buffer).toString(),
							l: buffer.length,
							nextIndex,
							x: buffer.length - nextIndex,
						});
						throw new Error(
							`Invalid boundary at index ${boundaryIndex}`,
						);
					}
				}

				// Possibly reached the end of the multipart message
				if (done || nextIndexCRLF >= 2) {
					if (
						[EState.BODY_PART, EState.ENCAPSULATION].includes(
							state,
						) &&
						buffer[nextIndex + 0] === buffer[nextIndex + 1] &&
						buffer[nextIndex + 0] === 0x2d
					) {
						state = EState.EPILOGUE;
					} else if (
						!LWSPchar.includes(buffer[nextIndex + 0]) ||
						!LWSPchar.includes(buffer[nextIndex + 1])
					) {
						throw new Error(
							`Invalid boundary at index ${boundaryIndex} (${boundary}): ${buffer[
								nextIndex + 1
							].toString(16)}`,
						);
					}
				}

				switch (state) {
					case EState.PREAMBLE:
						state = EState.BODY_PART;
						break;
					case EState.BODY_PART:
						state = EState.ENCAPSULATION;
					// eslint-disable-next-line no-fallthrough
					case EState.ENCAPSULATION:
					case EState.EPILOGUE:
						if (
							buffer.subarray(boundaryIndex, nextIndex).length > 0
						) {
							const part = buffer.subarray(0, boundaryIndex);
							const parsedPart = parseMessage(part);

							const partContentType =
								parsedPart.headers.get('content-type');

							let innerParts:
								| TMultipartMessage['parts']
								| undefined = undefined;

							if (
								parsedPart.body &&
								partContentType?.startsWith('multipart/')
							) {
								const partBoundaryMatch =
									partContentType.match(boundaryMatchRegex);

								if (partBoundaryMatch) {
									const partBoundary =
										partBoundaryMatch[1] ||
										partBoundaryMatch[2];

									innerParts = parseMultipartMessage(
										createBufferStream(parsedPart.body),
										partBoundary,
									);
								} else {
									innerParts = null;
								}
							}

							yield {
								headers: parsedPart.headers,
								body: parsedPart.body,
								...(innerParts !== undefined && {
									parts: innerParts,
								}),
							};
						}
						break;
				}

				if (state === EState.EPILOGUE) {
					buffer = buffer.subarray(buffer.length);
					break;
				}

				if (done) {
					throw new Error('Invalid message');
				}

				buffer = buffer.subarray(nextIndexCRLF + nextIndex + 2);
			}
		}
	} finally {
		// Release the lock on the reader
		reader.releaseLock();
	}
}

export default parseMultipartMessage;
