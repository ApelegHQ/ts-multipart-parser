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

import { parseMediaType } from '@apeleghq/http-media-type-negotiator/parseMediaType';
import { boundaryRegex } from './lib/boundaryRegex.js';
import createBufferStream from './lib/createBufferStream.js';
import findIndex from './lib/findIndex.js';
import isLWSP from './lib/isLWSP.js';
import mergeTypedArrays from './lib/mergeTypedArrays.js';
import ParseError from './lib/ParseError.js';
import parseMessage from './parseMessage.js';

enum EState {
	PREAMBLE,
	BODY_PART,
	ENCAPSULATION,
	EPILOGUE,
}

export type TMultipartMessage = {
	headers: Headers;
	body?: Uint8Array | null;
	parts?: TMultipartMessageGenerator | null;
};
export type TMultipartMessageGenerator = AsyncGenerator<TMultipartMessage>;

/**
 * Incrementally parses a `multipart/*` message from a readable stream.
 *
 * This async generator function reads from the provided stream and yields each
 * part of the multipart message as it's parsed. It is designed to handle large
 * messages efficiently by not buffering the entire message in memory.
 *
 * The parser can handle nested multipart content. If a part has a `Content-Type`
 * of `multipart/*`, its `parts` property will be an async generator that can be
 * consumed to parse the nested message.
 *
 * @example
 * ```javascript
 * async function runExample() {
 *   const boundary = 'simple-boundary';
 *   const multipartMessage = [
 *     `--${boundary}`,
 *     'Content-Type: text/plain',
 *     '',
 *     'This is the first part.',
 *     `--${boundary}`,
 *     'Content-Type: application/json',
 *     '',
 *     '{"key": "value"}',
 *     `--${boundary}--`,
 *   ].join('\r\n');
 *
 *   const stream = new ReadableStream({
 *     start(controller) {
 *       controller.enqueue(new TextEncoder().encode(multipartMessage));
 *       controller.close();
 *     },
 *   });
 *
 *   try {
 *     const textDecoder = new TextDecoder();
 *     for await (const part of parseMultipartMessage(stream, boundary)) {
 *       console.log('--- New Part ---');
 *       console.log('Headers:', Object.fromEntries(part.headers.entries()));
 *       if (part.body) {
 *         console.log('Body:', textDecoder.decode(part.body));
 *       }
 *     }
 *   } catch (error) {
 *     console.error('Failed to parse multipart message:', error);
 *   }
 * }
 *
 * // Expected output:
 * // --- New Part ---
 * // Headers: {
 * //   'content-transfer-encoding': '7bit',
 * //   'content-type': 'text/plain'
 * // }
 * // Body: This is the first part.
 * // --- New Part ---
 * // Headers: {
 * //   'content-transfer-encoding': '7bit',
 * //   'content-type': 'text/application/json'
 * // }
 * // Body: {"key": "value"}
 * ```
 *
 * @generator
 * @yields An object representing a single part of the multipart message,
 * containing `headers`, `body`, and an optional `parts` async generator for
 * nested multipart content.
 *
 * @param stream The `ReadableStream` source for the multipart message. The
 * stream should provide chunks of `ArrayBufferLike` data.
 * @param boundary The boundary delimiter string that separates the message
 * parts, as specified in the `Content-Type` header (without the leading `--`).
 * @param headersTransform An optional function to process or transform the
 * headers of each parsed part. It receives an array of `[name, value]` string
 * tuples and should return a `Headers` object.
 * @param permissive If `true`, the parser will be more lenient when parsing
 * `Content-Type` headers within the parts. Defaults to `false`.
 * @returns An async generator (`TMultipartMessageGenerator`) that yields each
 * parsed message part.
 * @throws {ParseError} Throws if the multipart message is malformed, such as
 * having an invalid boundary delimiter or incorrect part separation.
 */
async function* parseMultipartMessage(
	stream: ReadableStream<ArrayBufferLike>,
	boundary: string,
	headersTransform?: (headers: [name: string, value: string][]) => Headers,
	permissive?: boolean,
): TMultipartMessageGenerator {
	if (!boundaryRegex.test(boundary)) {
		throw new ParseError('Invalid boundary delimiter');
	}

	const textEncoder = new TextEncoder();
	const newline = [0x0d, 0x0a]; // '\r\n'

	const boundaryDelimiter = textEncoder.encode(`\r\n--${boundary}`);

	let buffer = new Uint8Array();
	let state: EState = EState.PREAMBLE;
	let eosReached = false;

	const reader = stream.getReader();

	try {
		while (state !== EState.EPILOGUE) {
			const { done, value } = await reader.read();

			if (done) {
				if (buffer.length === 0 || eosReached) {
					throw new ParseError('Invalid message');
				}
				eosReached = true;
			} else {
				buffer = mergeTypedArrays<typeof buffer>(
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

			while (buffer.length > 0) {
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
				const nextIndexCRLF = done
					? 0
					: findIndex(
							buffer.subarray(nextIndex, nextIndex + 32),
							newline,
						);

				if (nextIndexCRLF === -1 && buffer.length - nextIndex < 32) {
					break;
				}

				if (
					nextIndexCRLF === -1 ||
					!Array.from(
						buffer.subarray(
							nextIndex + Math.min(2, nextIndexCRLF),
							nextIndex + nextIndexCRLF,
						),
					).every((v) => isLWSP(v))
				) {
					throw new ParseError(
						`Invalid boundary at index ${boundaryIndex}`,
					);
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
						!isLWSP(buffer[nextIndex + 0]) ||
						!isLWSP(buffer[nextIndex + 1])
					) {
						throw new ParseError(
							`Invalid boundary at index ${boundaryIndex} (${boundary}): ${buffer[
								nextIndex + 1
							]?.toString(16)}`,
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
							const parsedPart = parseMessage(
								part,
								headersTransform,
							);

							let innerParts:
								| TMultipartMessage['parts']
								| undefined = undefined;

							const partContentType =
								parsedPart.headers.get('content-type');

							const parsedPartContentType = partContentType
								? parseMediaType(partContentType, permissive)
								: null;

							if (
								parsedPart.body &&
								parsedPartContentType?.[0]
									.toLowerCase()
									.startsWith('multipart/')
							) {
								const partBoundaryParam =
									parsedPartContentType[1].find((param) => {
										return (
											param[0].toLowerCase() ===
											'boundary'
										);
									});

								if (partBoundaryParam) {
									const partBoundary = partBoundaryParam[1];

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

				buffer = buffer.subarray(nextIndexCRLF + nextIndex + 2);
			}
		}
	} finally {
		// Release the lock on the reader
		reader.releaseLock();
	}
}

export default parseMultipartMessage;
