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

import assert from 'node:assert';
import { webcrypto } from 'node:crypto';
import {
	encodeMultipartMessage as encoder,
	TDecodedMultipartMessage,
} from '../src/encodeMultipartMessage.js';
import { createBufferStream } from '../src/lib/createBufferStream.js';

!globalThis.crypto &&
	((() => globalThis || { crypto: {} })().crypto =
		webcrypto as unknown as Crypto);

const textEncoder = new TextEncoder();

const testVectors: {
	name: string;
	boundary: string;
	src: string;
	parsed: TDecodedMultipartMessage[];
}[] = [
	/* From RFC 1521 section 7.2.4 */
	{
		name: 'RFC 1521 section 7.2.4',
		boundary: '---- next message ----',
		src: `
------ next message ----
From: someone-else
Subject: my opinion

...body goes here ...

------ next message ----
From: someone-else-again
Subject: my different opinion

... another body goes here...

------ next message ------
`,
		parsed: [
			{
				headers: new Headers({
					['from']: 'someone-else',
					['subject']: 'my opinion',
				}),
				body: textEncoder.encode('...body goes here ...\r\n').buffer,
			},
			{
				headers: new Headers({
					['from']: 'someone-else-again',
					['subject']: 'my different opinion',
				}),
				body: new Blob([
					textEncoder.encode('... another body goes here...\r\n'),
				]),
			},
		],
	},
	/* From RFC 2046 section 5.1.1 */
	{
		name: 'RFC 2046 section 5.1.1',
		boundary: 'simple boundary',
		src: /*
		 */ `
--simple boundary

This is implicitly typed plain US-ASCII text.
It does NOT end with a linebreak.
--simple boundary
Content-type: text/plain; charset=us-ascii

This is explicitly typed plain US-ASCII text.
It DOES end with a linebreak.

--simple boundary--
`,

		parsed: [
			{
				headers: new Headers({}),
				body: createBufferStream(
					textEncoder.encode(
						'This is implicitly typed plain US-ASCII text.\r\nIt does NOT end with a linebreak.',
					),
				),
			},
			{
				headers: new Headers({
					['content-type']: 'text/plain; charset=us-ascii',
				}),
				body: textEncoder.encode(
					'This is explicitly typed plain US-ASCII text.\r\nIt DOES end with a linebreak.\r\n',
				),
			},
		],
	},
	{
		name: 'Nested',
		boundary: 'boundary_1',
		src: /*
		 */ `
--boundary_1
Content-Type: multipart/mixed; boundary=boundary_2

--boundary_2
Content-Type: multipart/alternative; boundary=boundary_3

--boundary_3
Content-Type: text/plain; charset=UTF-8

Hello,

This is a plain text message.

Best regards,
Sender

--boundary_3
Content-Type: text/html; charset=UTF-8

<html>
  <body>
    <p>Hello,</p>
    <p>This is an HTML message.</p>
    <p>Best regards,<br>Sender</p>
  </body>
</html>

--boundary_3--
--boundary_2
Content-Disposition: attachment; filename="example.dat"
Content-Type: image/example

<binary data>

--boundary_2--
--boundary_1--
`,
		parsed: [
			{
				headers: new Headers({
					['content-type']: 'multipart/mixed; boundary=boundary_2',
				}),
				parts: [
					{
						headers: new Headers({
							['content-type']:
								'multipart/alternative; boundary=boundary_3',
						}),
						parts: [
							{
								headers: new Headers({
									'content-type': 'text/plain; charset=UTF-8',
								}),
								body: textEncoder.encode(
									'Hello,\r\n' +
										'\r\n' +
										'This is a plain text message.\r\n' +
										'\r\n' +
										'Best regards,\r\n' +
										'Sender\r\n',
								),
							},
							{
								headers: new Headers({
									['content-type']:
										'text/html; charset=UTF-8',
								}),
								body: textEncoder.encode(
									'<html>\r\n' +
										'  <body>\r\n' +
										'    <p>Hello,</p>\r\n' +
										'    <p>This is an HTML message.</p>\r\n' +
										'    <p>Best regards,<br>Sender</p>\r\n' +
										'  </body>\r\n' +
										'</html>\r\n',
								),
							},
						],
					},
					{
						headers: new Headers({
							['content-disposition']:
								'attachment; filename="example.dat"',
							['content-type']: 'image/example',
						}),
						body: textEncoder.encode('<binary data>\r\n'),
					},
				],
			},
		],
	},
];

const newLineToCRLF = (str: string) =>
	str.replace(/\r(?!n)|(?<!\r)\n/g, '\r\n');

const runTest = async (
	boundary: string,
	testVector: TDecodedMultipartMessage[],
	expected: string,
) => {
	const stream = encoder(boundary, testVector);
	const reader = stream.getReader();
	const parts = [];

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			parts.push(Buffer.from(value).toString());
		}
	} finally {
		reader.releaseLock();
	}

	assert.equal(
		parts.join('').toLowerCase(),
		newLineToCRLF(expected).toLowerCase(),
	);
};

describe('Encoding', () => {
	testVectors.forEach((v) => {
		it(v.name, () => runTest(v.boundary, v.parsed, v.src));
	});
});
