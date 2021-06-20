import fs, { promises as fsP } from 'fs';
import path from 'path';

import { NonFatalError } from '../errors.js';

async function checkPath(pathArg: string, type: 'source' | 'destination') {
	await fsP.access(pathArg, fs.constants.F_OK).catch(() => {
		throw new NonFatalError('PATH_DOES_NOT_EXIST', type);
	});

	if (type === 'source') {
		await fsP.access(pathArg, fs.constants.R_OK).catch(() => {
			throw new NonFatalError('NO_READ_PERMISSIONS_TYPE', type);
		});
	} else {
		if (!(await fsP.stat(pathArg)).isDirectory()) throw new NonFatalError('DESTINATION_INVALID');

		await fsP.access(pathArg, fs.constants.W_OK).catch(() => {
			throw new NonFatalError('NO_WRITE_PERMISSIONS_TYPE', type);
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
