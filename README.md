# Multipart Message Parser

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
npm install @exact-realty/multipart-message-parser
```

```sh
yarn add @exact-realty/multipart-message-parser
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
