import fs, { promises as fsP } from 'fs';

import { NonFatalError } from '../errors.js';

export function mkdirIfDoesNotExist(destinationPath: string, recursive = false) {
	return new Promise<void>((resolve, reject) => {
		fsP.access(destinationPath, fs.constants.F_OK)
			.then(() => {
				fsP.access(destinationPath, fs.constants.W_OK).then(resolve).catch(() => reject(new NonFatalError('NO_WRITE_PERMISSIONS_PATH', destinationPath)));
			}).catch(() => {
				fsP.mkdir(destinationPath, { recursive }).then(() => resolve()).catch(reject);
			});
	});
}