import fs, { promises as fsP } from 'fs';

import { NonFatalError } from '../errors.js';

export function mkdirIfDoesNotExist(destinationPath: string) {
	return new Promise<void>((resolve, reject) => {
		fsP.access(destinationPath, fs.constants.F_OK)
			.then(() => {
				fsP.access(destinationPath, fs.constants.W_OK).then(resolve).catch(() => reject(new NonFatalError('NO_WRITE_PERMISSIONS_PATH', destinationPath)));
			}).catch(() => {
				// We only know that we want to mkdir when we encountered a file we want to write, so we have no guarantee that parent folder exists; always recurse
				fsP.mkdir(destinationPath, { recursive: true }).then(() => resolve()).catch(reject);
			});
	});
}