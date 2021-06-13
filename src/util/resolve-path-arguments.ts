import fs, { promises as fsP } from 'fs';
import path from 'path';

async function checkPath(pathArg: string, type: string) {
	await fsP.access(pathArg, fs.constants.F_OK).catch(() => {
		throw `The ${type} path does not exist.`;
	});

	if (type === 'source') {
		await fsP.access(pathArg, fs.constants.R_OK).catch(() => {
			throw `The ${type} path cannot be read from.`;
		});
	} else {
		if (!(await fsP.stat(pathArg)).isDirectory()) throw 'Destination must be a directory.';

		await fsP.access(pathArg, fs.constants.W_OK).catch(() => {
			throw `The ${type} path cannot be written to.`;
		});
	}
}

export async function resolvePathArguments(extension: string, source: string, destination?: string) {
	source = path.resolve(source);
	await checkPath(source, 'source');

	if (typeof destination === 'string') {
		destination = path.resolve(destination);
		await checkPath(destination, 'destination');
	} else {
		const sourceEntry = await fsP.stat(source);
		destination = source.endsWith(extension) && ((extension.startsWith('.') && sourceEntry.isFile()) || (extension.startsWith('-') && sourceEntry.isDirectory()))
			? path.parse(source).dir
			: source;
	}

	return [source, destination];
}
