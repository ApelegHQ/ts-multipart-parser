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

import parseMediaType from '@apeleghq/http-media-type-negotiator/parseMediaType';
import { boundaryRegex } from './lib/boundaryRegex.js';
import createBufferStream from './lib/createBufferStream.js';
import EncodeError from './lib/EncodeError.js';

type TIterable<T> = AsyncIterable<T> | Iterable<T>;

type TBaseDecodedMultipartMessage = {
	['headers']?: Headers;
};
type TDecodedMultipartMessageWithBody = TBaseDecodedMultipartMessage & {
	['body']: BufferSource | Blob | ReadableStream | null;
};
type TDecodedMultipartMessageWithParts = TBaseDecodedMultipartMessage & {
	['parts']: TIterable<TDecodedMultipartMessage>;
};

export type TDecodedMultipartMessage =
	| TBaseDecodedMultipartMessage
	| TDecodedMultipartMessageWithBody
	| TDecodedMultipartMessageWithParts;

const isWithParts = (
	x: TDecodedMultipartMessage,
): x is TDecodedMultipartMessageWithParts => {
	return !!(x as TDecodedMultipartMessageWithParts).parts;
};

const isWithBody = (
	x: TDecodedMultipartMessage,
): x is TDecodedMultipartMessageWithBody => {
	return (x as TDecodedMultipartMessageWithBody).body != null;
};

const fixBoundaryParam = (
	partContentType: string,
	partBoundaryParam?: [string, string],
) => {
	const subBoundary = generateMultipartBoundary();
	if (!partBoundaryParam) {
		partContentType = `${partContentType.replace(/;[ \t]*$/, '')}; boundary="${subBoundary}"`;
	} else {
		let pos = partContentType.indexOf(';');
		let lcPartContentType = partContentType.toLowerCase();
		let alreadyFixed = false;

		for (;;) {
			const index = lcPartContentType.indexOf('boundary=', pos);
			if (index === -1) break;

			let boundaryStart = index + 9;
			const quoted = lcPartContentType[boundaryStart] === '"';
			if (quoted) {
				boundaryStart++;
			}

			if (
				lcPartContentType.slice(
					boundaryStart,
					boundaryStart + partBoundaryParam[1].length,
				) === partBoundaryParam[1]
			) {
				const nextChar =
					lcPartContentType[
						boundaryStart + partBoundaryParam[1].length
					];

				if (
					(quoted && nextChar === '"') ||
					(!quoted &&
						(nextChar === undefined ||
							nextChar === ';' ||
							nextChar === ' ' ||
							nextChar === '\t'))
				) {
					// If the fix was already applied, this means that some
					// ambiguous situation that this logic can't handle has
					// occurred
					if (alreadyFixed) {
						throw new EncodeError(
							'Invalid boundary given and unable to fix it',
						);
					}
					alreadyFixed = true;

					partContentType =
						partContentType.slice(0, boundaryStart) +
						(quoted ? '' : '"') +
						subBoundary +
						(quoted ? '' : '"') +
						partContentType.slice(
							boundaryStart + partBoundaryParam[1].length,
						);
					lcPartContentType =
						partContentType.slice(0, boundaryStart) +
						(quoted ? '' : '"') +
						subBoundary +
						(quoted ? '' : '"') +
						lcPartContentType.slice(
							boundaryStart + partBoundaryParam[1].length,
						);
				}
			}

			pos = boundaryStart;
		}
	}

	return [subBoundary, partContentType];
};

const multipartBoundaryAlphabet =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
	'abcdefghijklmnopqrstuvwxyz' +
	'0123456789' +
	'+_-.';

const generateMultipartBoundary = (): string => {
	const buffer = new Uint8Array(24);
	globalThis.crypto.getRandomValues(buffer);
	return Array.from(buffer)
		.map(
			(v) =>
				multipartBoundaryAlphabet[v % multipartBoundaryAlphabet.length],
		)
		.join('');
};

const pipeToOptions = {
	preventClose: true,
};

async function* asyncEncoderGenerator(
	boundary: string,
	msg: TIterable<TDecodedMultipartMessage>,
	ws: WritableStream,
): AsyncGenerator<void> {
	const textEncoder = new TextEncoder();
	const encodedBoundary = textEncoder.encode(`\r\n--${boundary}`);

	if (Array.isArray(msg) && msg.length < 1) {
		await ws.abort(new EncodeError('At least one part is required'));
		return;
	}

	let count = 0;

	for await (const part of msg) {
		count++;
		let subBoundary: string | undefined;
		let partContentType: string | null | undefined;

		// First, do some validation in case a multipart message
		// needs to be encoded
		if (isWithParts(part)) {
			partContentType = part.headers?.get('content-type');

			if (!partContentType) {
				subBoundary = generateMultipartBoundary();
				partContentType = `multipart/mixed; boundary="${subBoundary}"`;
			} else {
				const parsedPartContentType = parseMediaType(partContentType);
				if (
					!parsedPartContentType[0]
						.toLowerCase()
						.startsWith('multipart/')
				) {
					await ws.abort(
						new EncodeError(
							'Invalid multipart content type: ' +
								partContentType,
						),
					);
					return;
				}

				const partBoundaryParam = parsedPartContentType[1].find(
					(param) => {
						return param[0].toLowerCase() === 'boundary';
					},
				);

				// Invalid boundary. Attempt to replace it.
				// This logic covers most cases but not some special cases,
				// such as boundary=orig appearing inside of another parameter
				if (
					!partBoundaryParam ||
					!boundaryRegex.test(partBoundaryParam[1])
				) {
					const fixed = fixBoundaryParam(
						partContentType,
						partBoundaryParam,
					);
					subBoundary = fixed[0];
					partContentType = fixed[1];
				} else {
					subBoundary = partBoundaryParam[1];
				}
			}
		}

		await createBufferStream(encodedBoundary).pipeTo(ws, pipeToOptions);
		yield;

		// Send headers
		{
			const hh: string[] = [''];
			if (partContentType) {
				let seenContentType = false;
				part.headers?.forEach((v, k) => {
					if (k !== 'content-type') {
						hh.push(`${k}: ${v}`);
					} else {
						seenContentType = true;
						hh.push(`${k}: ${partContentType}`);
					}
				});
				if (!seenContentType) {
					hh.push(`content-type: ${partContentType}`);
				}
			} else if (part.headers) {
				part.headers.forEach((v, k) => {
					hh.push(`${k}: ${v}`);
				});
			}

			if (isWithParts(part)) {
				hh.push('');
			} else {
				hh.push('', '');
			}
			const headers = textEncoder.encode(hh.join('\r\n'));
			hh.length = 0;
			await createBufferStream(headers).pipeTo(ws, pipeToOptions);
			yield;
		}

		// Now, we'll either send a body, if there is one, or construct
		// a multipart submessage
		if (isWithBody(part)) {
			if (
				part.body instanceof ArrayBuffer ||
				ArrayBuffer.isView(part.body)
			) {
				await createBufferStream(part.body).pipeTo(ws, pipeToOptions);
			} else if (part.body instanceof Blob) {
				await part.body.stream().pipeTo(ws, pipeToOptions);
			} else if (part.body instanceof ReadableStream) {
				await part.body.pipeTo(ws, pipeToOptions);
			} else {
				await ws.abort(new EncodeError('Invalid body type'));
				return;
			}
			yield;
		} else if (isWithParts(part)) {
			if (!subBoundary) {
				await ws.abort(new EncodeError('Undefined part boundary'));
				return;
			}

			yield* asyncEncoderGenerator(subBoundary, part.parts, ws);
			yield;
		}
	}

	if (!count) {
		await ws.abort(new EncodeError('At least one part is required'));
		return;
	}

	const encodedEndBoundary = textEncoder.encode(`\r\n--${boundary}--`);
	await createBufferStream(encodedEndBoundary).pipeTo(ws, pipeToOptions);
}

/**
 * Creates a `ReadableStream` that emits a `multipart/*` message by encoding an
 * iterable of message parts.
 *
 * This function is the inverse of `parseMultipartMessage`. It constructs a
 * complete multipart message from a series of part objects. It is designed for
 * efficiency and scalability, processing parts one by one and streaming the
 * output without buffering the entire message in memory. This makes it ideal
 * for handling large files or dynamic content.
 *
 * The encoder supports various body types for each part, including `ArrayBuffer`,
 * `ArrayBufferView`, `Blob`, and `ReadableStream`. It also handles nested
 * multipart messages recursively: if a part contains a `parts` iterable instead
 * of a `body`, it will be encoded as a nested multipart message with an
 * automatically generated or corrected boundary.
 *
 * @example
 * ```javascript
 * async function runExample() {
 *   const boundary = 'example-boundary';

 *   const parts = [
 *     {
 *       headers: new Headers({ 'Content-Type': 'text/plain' }),
 *       body: new TextEncoder().encode('This is the first part.'),
 *     },
 *     {
 *       headers: new Headers({ 'Content-Type': 'application/json' }),
 *       body: new TextEncoder().encode(JSON.stringify({
 *         id: 123,
 *         status: 'ok'
 *       })),
 *     },
 *     // A nested multipart part
 *     {
 *       parts: [
 *         {
 *           headers: new Headers({'Content-Type': 'text/plain'}),
 *           body: new TextEncoder().encode('This is a nested part.'),
 *         }
 *       ]
 *     },
 *     // Another nested multipart part with a pre-set boundary
 *     {
 *       headers: new Headers({
 *         'Content-Type': 'multipart/example; boundary=foo'
 *       }),
 *       parts: [
 *         {
 *           headers: new Headers({'Content-Type': 'text/plain'}),
 *           body: new TextEncoder().encode('This is a nested part.'),
 *         }
 *       ]
 *     }
 *   ];

 *   // `TransformStream` to convert from ArrayBuffer to `Uint8Array`,
 *   // as needed by `Response`
 *   const ABtoU8 = new TransformStream({
 *     start() {},
 *     transform(chunk, controller) {
 *       controller.enqueue(new Uint8Array(chunk));
 *     },
 *   });
 *   encodeMultipartMessage(boundary, parts).pipeThrough(ABtoU8);

 *   // To consume the stream, you can use a Response object
 *   const response = new Response(ABtoU8.readable);
 *   const text = await response.text();

 *   console.log(text);
 * }
 *
 * // Expected output will be a string similar to this
 * // (nested boundary is random):
 * //
 * // --example-boundary
 * // content-type: text/plain
 * //
 * // This is the first part.
 * // --example-boundary
 * // content-type: application/json
 * //
 * // {"id":123,"status":"ok"}
 * // --example-boundary
 * // content-type: multipart/mixed; boundary="4_ypcARsDHmD8vEFybz+wVSg"
 * //
 * // --4_ypcARsDHmD8vEFybz+wVSg
 * // content-type: text/plain
 * //
 * // This is a nested part.
 * // --4_ypcARsDHmD8vEFybz+wVSg--
 * // --example-boundary
 * // content-type: multipart/example; boundary=foo
 * //
 * // --foo
 * // content-type: text/plain
 * //
 * // This is a nested part.
 * // --foo--
 * // --example-boundary--
 * ```
 *
 * @param boundary The boundary string used to separate parts. This should be
 * the raw boundary string, without the leading `--`.
 * @param msg An iterable (such as an array or an async generator) of message
 * part objects. Each object represents a part and should contain `headers` and
 * either a `body` or a nested `parts` iterable.
 * @returns A `ReadableStream` that yields `ArrayBuffer` chunks of the fully
 * formed multipart message, ready to be sent in a request or saved to a file.
 */
const encodeMultipartMessage = (
	boundary: string,
	msg: TIterable<TDecodedMultipartMessage>,
): ReadableStream<ArrayBuffer> => {
	const transformStream = new TransformStream<ArrayBuffer>();

	const asyncEncoder = asyncEncoderGenerator(
		boundary,
		msg,
		transformStream.writable,
	);
	let finishedEncoding: boolean | undefined = false;

	const reader = transformStream.readable.getReader();

	const readableStream = new ReadableStream<ArrayBuffer>({
		start(controller) {
			(async () => {
				for (;;) {
					try {
						const readResult = await reader.read();
						if (readResult.done) {
							const terminator = new Uint8Array([0x0d, 0x0a]);
							controller.enqueue(
								terminator.buffer.slice(
									terminator.byteOffset,
									terminator.byteOffset +
										terminator.byteLength,
								),
							);
							controller.close();
							return;
						}

						controller.enqueue(readResult.value);
					} catch (readError) {
						controller.error(readError);
						return;
					}
				}
			})().catch(() => {});
		},
		async pull() {
			if (finishedEncoding) return;

			const encodingResult = await asyncEncoder.next();
			if (encodingResult.done) {
				finishedEncoding = true;
				await transformStream.writable.close();
			}
		},
	});

	return readableStream;
};

export default encodeMultipartMessage;
