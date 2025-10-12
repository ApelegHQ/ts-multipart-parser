/* Copyright © 2025 Apeleg Limited. All rights reserved.
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

const fuzzFactory = require('./fuzzFactory.cjs');

const {
	enableSet,
	isSetEnabled,
	enableStringIncludes,
	isStringIncludesEnabled,
} = (() => {
	const { Set } = globalThis;
	const { includes: String_includes } = String.prototype;

	let SetEnabled = true,
		StringIncludesEnabled = true;

	const enableSet = (v) => {
		SetEnabled = v;
	};
	const isSetEnabled = () => SetEnabled;
	const enableStringIncludes = (v) => {
		StringIncludesEnabled = v;
	};
	const isStringIncludesEnabled = () => StringIncludesEnabled;

	Object.defineProperties(globalThis, {
		Set: {
			get: () => {
				return SetEnabled ? Set : undefined;
			},
		},
	});

	Object.defineProperties(String.prototype, {
		includes: {
			get: () => {
				return StringIncludesEnabled ? String_includes : undefined;
			},
		},
	});

	return {
		enableSet,
		isSetEnabled,
		enableStringIncludes,
		isStringIncludesEnabled,
	};
})();

function hotRequire(id) {
	delete require.cache[require.resolve(id)];

	const SetEnabled = isSetEnabled();
	// FIXME: Causes issues with undici
	// const StringIncludesEnabled = isStringIncludesEnabled();

	enableSet(true);
	enableStringIncludes(true);

	try {
		return require(id);
	} finally {
		enableSet(SetEnabled);
		// FIXME: Causes issues with undici
		// enableStringIncludes(StringIncludesEnabled);
	}
}

const fuzz = (() => {
	const map = Object.create(null);

	const getFeatureKey = () => {
		return [isSetEnabled, isStringIncludesEnabled]
			.map((v) => +!!v())
			.join('');
	};

	const require_ = (id) => {
		const key = getFeatureKey();
		if (!Object.hasOwn(map, key)) {
			map[key] = Object.create(null);
		}
		const resolved = require.resolve(id);
		if (!Object.hasOwn(map[key], resolved)) {
			map[key][resolved] = hotRequire(resolved);
		}

		return map[key][resolved];
	};

	return fuzzFactory(require_, (buf) => {
		enableSet(!(buf[0] & 0b0010_0000));
		// FIXME: Causes issues with undici
		// enableStringIncludes(!(buf[0] & 0b0000_1000));
	});
})();

module.exports = { fuzz };
