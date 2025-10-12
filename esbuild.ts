#!/usr/bin/env -S node --import ./loader.mjs

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

import esbuild from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outdir = process.env['BUILD_TARGET_DIR'] || 'dist';

const buildOptionsBase: esbuild.BuildOptions = {
	entryPoints: [
		'./src/index.ts',
		'./src/exports/encodeMultipartMessage.ts',
		'./src/exports/parseMessage.ts',
		'./src/exports/parseMultipartMessage.ts',
	],
	target: 'es2018',
	outdir,
	bundle: true,
	minify: true,
	entryNames: '[name]',
	platform: 'node',
	external: ['esbuild'],
};

const formats: esbuild.Format[] = ['cjs', 'esm'];

await Promise.all(
	formats.map((format) => {
		return esbuild.build({
			...buildOptionsBase,
			format,
			outExtension: {
				'.js': format === 'esm' ? '.mjs' : '.cjs',
			},
			define: {
				...buildOptionsBase.define,
				'import.meta.format': JSON.stringify(format),
			},
		});
	}),
);

const cjsDeclarationFiles = async (directoryPath: string) => {
	const entries = await readdir(directoryPath, {
		withFileTypes: true,
		recursive: true,
	});

	await Promise.all(
		entries
			.filter((entry) => {
				return entry.isFile() && entry.name.endsWith('.d.ts');
			})
			.map(async (file) => {
				const name = join(file.parentPath, file.name);
				const newName = name.slice(0, -2) + 'cts';

				const contents = await readFile(name, { encoding: 'utf-8' });
				await writeFile(
					newName,
					contents.replace(/(?<=\.)js(?=['"])/g, 'cjs'),
				);
			}),
	);
};

await cjsDeclarationFiles(outdir);
