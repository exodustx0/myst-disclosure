/* eslint-disable @typescript-eslint/no-empty-function */
import fs from 'fs';
import os from 'os';
import path from 'path';

import del from 'del';
import signalExit from 'signal-exit';
import uniqueString from 'unique-string';

import { NonFatalError } from '../errors.js';

let tempDirPath = '';
let cancelSignalExit = () => {};

const deleteTempDir = () => {
	try {
		// FIXME: figure out why most of the time, when interrupting, the temp files get deleted, but not the containing folder (tempDirPath)
		del.sync(tempDirPath, { force: true });
	} catch {
		throw new NonFatalError('TEMP_DIR_DELETE_FAILED', { path: tempDirPath });
	}
	tempDirPath = '';
};

const createTempDir = () => {
	tempDirPath = path.join(fs.realpathSync(os.tmpdir()), `disclosure_${uniqueString()}`);
	fs.mkdirSync(tempDirPath);
	cancelSignalExit = signalExit(deleteTempDir);
};

export const tempManager = {
	get newFilePath() {
		if (tempDirPath === '') createTempDir();
		return path.join(tempDirPath, uniqueString());
	},

	deleteDir() {
		if (tempDirPath !== '') {
			cancelSignalExit();
			cancelSignalExit = () => {};
			deleteTempDir();
		}
	},
};
