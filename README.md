# Multipart Message Parser

 [![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Exact-Realty_ts-multipart-parser&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Exact-Realty_ts-multipart-parser)
 [![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Exact-Realty_ts-multipart-parser&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Exact-Realty_ts-multipart-parser)
 [![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Exact-Realty_ts-multipart-parser&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Exact-Realty_ts-multipart-parser)
 [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Exact-Realty_ts-multipart-parser&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Exact-Realty_ts-multipart-parser)
 [![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Exact-Realty_ts-multipart-parser&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Exact-Realty_ts-multipart-parser)
 ![NPM Downloads](https://img.shields.io/npm/dw/@exact-realty/multipart-parser?style=flat-square)

This is a library for parsing MIME multipart messages, such as those used in
HTTP requests and email messages, written in TypeScript. It provides an
easy-to-use async generator that returns the parsed headers and body of each
part in a multipart message. Nested multipart messages are supported.

## Features

  * Parses multipart messages according to the
    [specification](https://www.ietf.org/rfc/rfc2046.html#section-5.1)
  * Supports nested multipart messages
  * Lightweight and fast
  * Written in TypeScript, but can be used with plain JavaScript as well
  * Well-tested

## 🚀 Installation

You can install the library using either `npm` or `yarn`:

```sh
npm install @exact-realty/multipart-parser
```

```sh
yarn add @exact-realty/multipart-parser
```

## 🎬 Usage

The library exports the function `parseMultipartMessage`, which returns an async
generator that yields objects with the headers and body (as a `Uint8Array`) of
each part in the multipart message.

### 📚 API

#### `parseMultipartMessage(stream: ReadableStream, boundary: string): AsyncGenerator`

This function takes a `ReadableStream` and a boundary string as arguments, and
returns an asynchronous generator that yields objects with the following
properties:

  * `headers`: a `Headers` object containing the headers of the current part
  * `body`: a `Uint8Array` containing the body of the current part, or `null` if
    the part is empty.
  * `parts`: a nested iterator of the same structure for any parts within the
    current part, if the part's `Content-Type` header indicates that it is a
multipart message.

#### `boundaryRegex: RegExp`

A regular expression that can be used to validate a boundary string.

#### `boundaryMatchRegex: RegExp`

A regular expression that can be used to extract a boundary string from a
`Content-Type` header.

#### `encodeMultipartMessage(boundary: string, msg: AsyncIterable<TDecodedMultipartMessage>): ReadableStream<ArrayBuffer>`

This function takes a boundary string and an array of messages as arguments and returns a `ReadableStream` that can be read to obtain a multipart message.

`TDecodedMultipartMessage` is defined as an object with the following fields:

  * `headers`: a `Headers` object containing the headers of the current part
  * `body` (optional): The body of the current part, or `null` if the part is
     empty. It can be any of the following types: `ArrayBuffer`, `Blob`, `ReadableStream` or any typed array, such as `Uint8Array`.
  * `parts` (optional): An async or sync iterable of one element or more of
     the same type (`TDecodedMultipartMessage`), for nested messages. If both
     `body` and `parts` are specified, `body` takes precedence.

### Example

```js
import { parseMultipartMessage } from '@exact-realty/multipart-message-parser';

const decoder = new TextDecoder();

const stream = ... // a ReadableStream containing the multipart message
const boundary = 'my-boundary'; // the boundary of the multipart message

for await (const part of parseMultipartMessage(stream, boundary)) {
  console.log(part.headers.get('content-type'));
  console.log(decoder.decode(part.body));
}
```

## 🤝 Contributing

We welcome contributions to this project! Feel free to submit a pull request or
open an issue if you find a bug or have a feature request.

## 📄 License

This library is licensed under the ISC License, see LICENSE for more
information.
