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

import assert from 'node:assert/strict';
import { boundaryMatchRegex } from '../src/lib/boundaryRegex.js';
import {
	parseMultipartMessage as parse,
	TMultipartMessageGenerator,
} from '../src/parseMultipartMessage.js';

const testVectors: {
	name: string;
	boundary: string;
	src: string;
	parsed: TT[];
}[] = [
	/* From RFC 1521 section 7.2.4 */
	{
		name: 'RFC 1521 section 7.2.4',
		boundary: '---- next message ----',
		src: /*
		 */ `From: Moderator-Address
MIME-Version: 1.0
Subject:  Internet Digest, volume 42
Content-Type: multipart/digest; boundary="---- next message ----"


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
				h: {
					['content-transfer-encoding']: '7bit',
					['content-type']: 'text/plain; charset=us-ascii',
					['from']: 'someone-else',
					['subject']: 'my opinion',
				},
				b: '...body goes here ...\r\n',
			},
			{
				h: {
					['content-transfer-encoding']: '7bit',
					['content-type']: 'text/plain; charset=us-ascii',
					['from']: 'someone-else-again',
					['subject']: 'my different opinion',
				},
				b: '... another body goes here...\r\n',
			},
		],
	},
	/* From RFC 2046 section 5.1.1 */
	{
		name: 'RFC 2046 section 5.1.1',
		boundary: 'simple boundary',
		src: /*
		 */ `From: Nathaniel Borenstein <nsb@bellcore.com>
To: Ned Freed <ned@innosoft.com>
Date: Sun, 21 Mar 1993 23:56:48 -0800 (PST)
Subject: Sample message
MIME-Version: 1.0
Content-type: multipart/mixed; boundary="simple boundary"

This is the preamble.  It is to be ignored, though it
is a handy place for composition agents to include an
explanatory note to non-MIME conformant readers.

--simple boundary

This is implicitly typed plain US-ASCII text.
It does NOT end with a linebreak.
--simple boundary
Content-type: text/plain; charset=us-ascii

This is explicitly typed plain US-ASCII text.
It DOES end with a linebreak.

--simple boundary--

This is the epilogue.  It is also to be ignored.
`,

		parsed: [
			{
				h: {
					['content-transfer-encoding']: '7bit',
					['content-type']: 'text/plain; charset=us-ascii',
				},
				b: 'This is implicitly typed plain US-ASCII text.\r\nIt does NOT end with a linebreak.',
			},
			{
				h: {
					['content-transfer-encoding']: '7bit',
					['content-type']: 'text/plain; charset=us-ascii',
				},
				b: 'This is explicitly typed plain US-ASCII text.\r\nIt DOES end with a linebreak.\r\n',
			},
		],
	},
	{
		name: 'Nested',
		boundary: 'boundary_1',
		src: /*
		 */ `From: sender@example.com
To: recipient@example.com
Subject: Example of a nested multipart message
Content-Type: multipart/mixed; boundary=boundary_1

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
Content-Type: image/example
Content-Disposition: attachment;
  filename="example.dat"

<binary data>

--boundary_2--
--boundary_1--
`,
		parsed: [
			{
				h: {
					['content-transfer-encoding']: '7bit',
					['content-type']: 'multipart/mixed; boundary=boundary_2',
				},
				b: '--boundary_2\r\nContent-Type: multipart/alternative; boundary=boundary_3\r\n\r\n--boundary_3\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nHello,\r\n\r\nThis is a plain text message.\r\n\r\nBest regards,\r\nSender\r\n\r\n--boundary_3\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html>\r\n  <body>\r\n    <p>Hello,</p>\r\n    <p>This is an HTML message.</p>\r\n    <p>Best regards,<br>Sender</p>\r\n  </body>\r\n</html>\r\n\r\n--boundary_3--\r\n--boundary_2\r\nContent-Type: image/example\r\nContent-Disposition: attachment;\r\n  filename="example.dat"\r\n\r\n<binary data>\r\n\r\n--boundary_2--',
				p: [
					{
						h: {
							['content-transfer-encoding']: '7bit',
							['content-type']:
								'multipart/alternative; boundary=boundary_3',
						},
						b: '--boundary_3\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nHello,\r\n\r\nThis is a plain text message.\r\n\r\nBest regards,\r\nSender\r\n\r\n--boundary_3\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html>\r\n  <body>\r\n    <p>Hello,</p>\r\n    <p>This is an HTML message.</p>\r\n    <p>Best regards,<br>Sender</p>\r\n  </body>\r\n</html>\r\n\r\n--boundary_3--',
						p: [
							{
								h: {
									'content-transfer-encoding': '7bit',
									'content-type': 'text/plain; charset=UTF-8',
								},
								b:
									'Hello,\r\n' +
									'\r\n' +
									'This is a plain text message.\r\n' +
									'\r\n' +
									'Best regards,\r\n' +
									'Sender\r\n',
							},
							{
								h: {
									['content-transfer-encoding']: '7bit',
									['content-type']:
										'text/html; charset=UTF-8',
								},
								b:
									'<html>\r\n' +
									'  <body>\r\n' +
									'    <p>Hello,</p>\r\n' +
									'    <p>This is an HTML message.</p>\r\n' +
									'    <p>Best regards,<br>Sender</p>\r\n' +
									'  </body>\r\n' +
									'</html>\r\n',
							},
						],
					},
					{
						h: {
							['content-disposition']:
								'attachment;  filename="example.dat"',
							['content-transfer-encoding']: '7bit',
							['content-type']: 'image/example',
						},
						b: '<binary data>\r\n',
					},
				],
			},
		],
	},
	/* From RFC 7578 section 4.6 */
	{
		name: 'RFC 7578 section 4.6',
		boundary: '----WebKitFormBoundarylD5CPrRLWMEri7nf',
		src: /*
		 */ `------WebKitFormBoundarylD5CPrRLWMEri7nf
Content-Disposition: form-data; name="password"

stset
------WebKitFormBoundarylD5CPrRLWMEri7nf--
`,
		parsed: [
			{
				h: {
					['content-disposition']: 'form-data; name="password"',
					['content-transfer-encoding']: '7bit',
					['content-type']: 'text/plain; charset=us-ascii',
				},
				b: 'stset',
			},
		],
	},
];

const textDecoder = new TextDecoder();

const newLineToCRLF = (str: string) =>
	str.replace(/\r(?!n)|(?<!\r)\n/g, '\r\n');

const createStringStream = (str: string, chunkSize?: number) => {
	const encoder = new TextEncoder();
	const buffer = encoder.encode(str);
	const cs = !chunkSize ? str.length : chunkSize;
	let pos = 0;

	const readableStream = new ReadableStream({
		pull(controller) {
			controller.enqueue(buffer.subarray(pos, pos + cs));
			pos += cs;
			if (pos >= str.length) {
				controller.close();
			}
		},
	});
	return readableStream;
};

type TT = {
	h: Record<string, string>;
	b?: string;
	p?: TT[];
};

const extractParts = (testVector: string, boundary: string) => {
	const result = parse(
		createStringStream(newLineToCRLF(testVector), 4),
		boundary,
	);

	const inner = async (result: TMultipartMessageGenerator): Promise<TT[]> => {
		const parts: TT[] = [];

		for await (const part of result) {
			const hh: [string, string][] = [];
			part.headers.forEach((v, k) => hh.push([k, v]));

			parts.push({
				h: Object.fromEntries(hh),
				...(part.body && { b: textDecoder.decode(part.body) }),
				...(part.parts && { p: await inner(part.parts) }),
			});
		}

		return parts;
	};

	return inner(result);
};

const runTest = async (
	testVector: string,
	expectedBoundary: string,
	expected: TT[],
) => {
	if (!testVector.startsWith('--' + expectedBoundary)) {
		const boundary = (() => {
			const m = testVector.match(boundaryMatchRegex);
			return m && (m[1] || m[2]);
		})();
		assert.equal(boundary, expectedBoundary);
	}

	const parts = await extractParts(testVector, expectedBoundary);

	assert.deepEqual(parts, expected);
};

describe('Parse', () => {
	testVectors.forEach((v) => {
		it(v.name, () => runTest(v.src, v.boundary, v.parsed));
	});
});
