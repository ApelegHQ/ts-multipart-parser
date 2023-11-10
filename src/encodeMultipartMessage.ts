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

import { boundaryMatchRegex } from './lib/boundaryRegex.js';
import createBufferStream from './lib/createBufferStream.js';
import type { TTypedArray } from './types/index.js';

type TIterable<T> = AsyncIterable<T> | Iterable<T>;

export type TDecodedMultipartMessage = {
	headers: Headers;
	body?: TTypedArray | ArrayBuffer | Blob | ReadableStream | null;
	parts?: TIterable<TDecodedMultipartMessage>;
};

const textEncoder = new TextEncoder();

export const liberalBoundaryMatchRegex = /;\s*boundary=(?:"([^"]+)"|([^;",]+))/;

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
	const encodedBoundary = textEncoder.encode(`\r\n--${boundary}`);

	if (Array.isArray(msg) && msg.length < 1) {
		await ws.abort(Error('At least one part is required'));
		return;
	}

	let count = 0;

	for await (const part of msg) {
		count++;
		let subBoundary: string | undefined;
		let partContentType: string | null | undefined;

		// First, do some validation in case a multipart message
		// needs to be encoded
		if (!part.body && part.parts) {
			partContentType = part.headers.get('content-type');

			if (!partContentType) {
				subBoundary = generateMultipartBoundary();
				partContentType = `multipart/mixed; boundary="${subBoundary}"`;
			} else if (
				!partContentType.startsWith('multipart/') ||
				!liberalBoundaryMatchRegex.test(partContentType)
			) {
				await ws.abort(
					Error('Invalid multipart content type: ' + partContentType),
				);
				return;
			} else {
				const messageBoundaryMatch =
					partContentType.match(boundaryMatchRegex);

				// Invalid boundary. Attempt to replace it.
				if (
					!messageBoundaryMatch ||
					!(subBoundary =
						messageBoundaryMatch[1] || messageBoundaryMatch[2])
				) {
					subBoundary = generateMultipartBoundary();
					partContentType = partContentType.replace(
						liberalBoundaryMatchRegex,
						`; boundary="${subBoundary}"`,
					);
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
				part.headers.forEach((v, k) => {
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
			} else {
				part.headers.forEach((v, k) => {
					hh.push(`${k}: ${v}`);
				});
			}

			if (part.parts || !part.body) {
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
		if (part.body) {
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
				await ws.abort(Error('Invalid body type'));
				return;
			}
			yield;
		} else if (part.parts) {
			if (!subBoundary) {
				await ws.abort(
					Error('Runtime exception: undefined part boundary'),
				);
				return;
			}

			yield* asyncEncoderGenerator(subBoundary, part.parts, ws);
			yield;
		}
	}

	if (!count) {
		await ws.abort(Error('At least one part is required'));
		return;
	}

	const encodedEndBoundary = textEncoder.encode(`\r\n--${boundary}--`);
	await createBufferStream(encodedEndBoundary).pipeTo(ws, pipeToOptions);
}

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
		async pull(controller) {
			return Promise.all([
				!finishedEncoding && asyncEncoder.next(),
				reader.read(),
			]).then(async ([encodingResult, readResult]) => {
				if (encodingResult && encodingResult.done) {
					finishedEncoding = true;
					await transformStream.writable.close();
				}

				if (readResult.done) {
					const terminator = new Uint8Array([0x0d, 0x0a]);
					controller.enqueue(
						terminator.buffer.slice(
							terminator.byteOffset,
							terminator.byteOffset + terminator.byteLength,
						),
					);
					controller.close();
					return;
				}

				controller.enqueue(readResult.value);
			});
		},
	});

	return readableStream;
};

export default encodeMultipartMessage;
