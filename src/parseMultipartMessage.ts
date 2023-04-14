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

import createBufferStream from './lib/createBufferStream';
import findIndex from './lib/findIndex';
import mergeTypedArrays from './lib/mergeTypedArrays';
import parseMessage from './parseMessage';

enum EState {
	PREAMBLE,
	BODY_PART,
	ENCAPSULATION,
	EPILOGUE,
}

const textEncoder = new TextEncoder();

const newline = textEncoder.encode('\r\n');
const LWSPchar = [0x09, 0x20];

export const boundaryRegex =
	/^[0-9a-zA-Z'()+_,\-./:=? ]{0,69}[0-9a-zA-Z'()+_,\-./:=?]$/;

export const boundaryMatchRegex =
	/;\s*boundary=(?:"([0-9a-zA-Z'()+_,\-./:=? ]{0,69}[0-9a-zA-Z'()+_,\-./:=?])"|([0-9a-zA-Z'()+_,\-./=?]{0,69}[0-9a-zA-Z'()+_,\-./=?]))/;

export type TMultipartMessageIterator = AsyncGenerator<{
	headers: Headers;
	body?: Uint8Array | null;
	parts?: TMultipartMessageIterator;
}>;

async function* parseMultipartMessage<T extends TTypedArray>(
	stream: ReadableStream<T>,
	boundary: string,
): TMultipartMessageIterator {
	if (!boundaryRegex.test(boundary)) {
		throw new Error('Invalid bounday');
	}

	const boundaryDelimiter = textEncoder.encode(`\r\n--${boundary}`);

	let buffer = new Uint8Array();
	let state: EState = EState.PREAMBLE;

	const reader = stream.getReader();

	try {
		while (state !== EState.EPILOGUE) {
			const { done, value } = await reader.read();

			if (done) {
				throw new Error('Invalid message');
			}

			buffer = mergeTypedArrays(buffer, new Uint8Array(value.buffer));

			while (buffer.length) {
				const boundaryIndex = findIndex(buffer, boundaryDelimiter);

				if (boundaryIndex === -1) {
					// If the boundary isn't found in the current buffer, we need to read more data
					break;
				}

				// Check if the boundary is followed by a newline
				const nextIndex = boundaryIndex + boundaryDelimiter.length;
				const nextIndexCRLF = findIndex(
					buffer.subarray(nextIndex),
					newline,
				);

				if (
					nextIndexCRLF === -1 ||
					!Array.from(
						buffer.slice(
							nextIndex + Math.min(2, nextIndexCRLF),
							nextIndex + nextIndexCRLF,
						),
					).every((v) => LWSPchar.includes(v))
				) {
					throw new Error(
						`Invalid boundary at index ${boundaryIndex}`,
					);
				}

				if (nextIndexCRLF >= 2) {
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
						console.log(
							Buffer.from(buffer.subarray(0, nextIndex)).toString(
								'ascii',
							),
						);
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

							if (
								parsedPart.body &&
								partContentType?.startsWith('multipart/')
							) {
								const partBoundaryMatch =
									partContentType.match(boundaryMatchRegex);

								if (!partBoundaryMatch) {
									throw new Error('Invalid inner part');
								}

								const partBoundary =
									partBoundaryMatch[1] ||
									partBoundaryMatch[2];

								yield {
									headers: parsedPart.headers,
									body: parsedPart.body,
									parts: parseMultipartMessage(
										createBufferStream(parsedPart.body),
										partBoundary,
									),
								};
							} else {
								yield parsedPart;
							}
						}
						break;
				}

				if (state === EState.EPILOGUE) {
					buffer = buffer.subarray(buffer.length);
					break;
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
