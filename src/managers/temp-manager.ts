import fs from 'fs';
import os from 'os';
import path from 'path';

import del from 'del';
import uniqueString from 'unique-string';

import { NonFatalError } from '../errors.js';

let tempDirPath = '';

const deleteTempDir = () => {
	try {
		del.sync(tempDirPath, { force: true });
	} catch {
		throw new NonFatalError('TEMP_DIR_DELETE_FAILED', tempDirPath);
	}
	tempDirPath = '';
};

const createTempDir = () => {
	tempDirPath = path.join(fs.realpathSync(os.tmpdir()), `disclosure_${uniqueString()}`);
	fs.mkdirSync(tempDirPath);
	// TODO: replace with signal-exit
	process.once('SIGTERM', deleteTempDir);
	process.once('SIGINT', deleteTempDir);
};

export const tempManager = {
	get newFilePath() {
		if (tempDirPath === '') createTempDir();
		return path.join(tempDirPath, uniqueString());
	},
	
	deleteDir() {
		if (tempDirPath !== '') {
			process.removeListener('SIGTERM', deleteTempDir);
			process.removeListener('SIGINT', deleteTempDir);
			deleteTempDir();
		}
	},
};
