import fs, { promises as fsP } from 'fs';
import path from 'path';

import { NonFatalError } from '../errors.js';

let source: string;
let sourceExtension: string;
let destination: string;
let destinationExtension: string;
let extension: string;
const pathSegments: string[] = [];

let sourceRootStats: fs.Stats | undefined;
const getSourceRootStats = () => {
	if (!sourceRootStats) sourceRootStats = fs.statSync(source);
	return sourceRootStats;
};

const isUnpacking = () => {
	return sourceExtension.startsWith('.');
};

const checkPath = async (pathArg: string, type: 'source' | 'destination') => {
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
};

const throwSourceInvalid = () => {
	const error = isUnpacking()
		? new NonFatalError('SOURCE_INVALID_UNPACK', extension)
		: new NonFatalError('SOURCE_INVALID_REPACK', extension);

	Error.captureStackTrace(error, throwSourceInvalid);

	throw error;
};

const sourceIsSingleItem = () => {
	return source.endsWith(sourceExtension) && (
		(isUnpacking() && getSourceRootStats().isFile()) ||
		(!isUnpacking() && getSourceRootStats().isDirectory())
	);
};

const sourceIsDirectoryOfItems = () => {
	return !source.endsWith(sourceExtension) && getSourceRootStats().isDirectory();
};

const mkdirIfDoesNotExist = () => {
	return new Promise<void>((resolve, reject) => {
		// We only know that we want to mkdir when we encountered a file we want to write, so path will point to file; always go up one level
		const destinationPath = path.parse(
			path.join(destination, ...pathSegments)
				.replace(new RegExp('\\' + sourceExtension, 'g'), destinationExtension),
		).dir;

		fsP.access(destinationPath, fs.constants.F_OK)
			.then(() => {
				fsP.access(destinationPath, fs.constants.W_OK)
					.then(() => resolve())
					.catch(() => reject(new NonFatalError('NO_WRITE_PERMISSIONS_PATH', destinationPath)));
			}).catch(() => {
				// We only know that we want to mkdir when we encountered a file we want to write, so we have no guarantee that parent directory exists; always recurse
				fsP.mkdir(destinationPath, { recursive: true })
					.then(() => resolve())
					.catch(() => reject());
			});
	});
};

const iterateOverDirectory = async (callback: () => Promise<void>, root = true) => {
	const dir = (await fsP.readdir(path.join(source, ...pathSegments), { withFileTypes: true }))
		.filter(isUnpacking()
			? entry =>
				(entry.isDirectory() && !entry.name.startsWith(sourceExtension)) ||
				(entry.isFile() && entry.name.endsWith(sourceExtension))
			: entry => entry.isDirectory(),
		);

	if (root && !dir.some(entry => entry.name.endsWith(sourceExtension))) throwSourceInvalid();

	for (const entry of dir) {
		pathSegments.push(entry.name);

		if (entry.name.endsWith(sourceExtension)) {
			if (!root) await mkdirIfDoesNotExist();

			await callback();
		} else {
			await iterateOverDirectory(callback, /* root */ false);
		}

		pathSegments.pop();
	}
};

export const pathManager = {
	async init(fileExtension: string, operation: 'unpack' | 'repack', sourceArg: string, destinationArg?: string) {
		extension = fileExtension;

		if (operation === 'unpack') {
			sourceExtension = '.' + extension;
			destinationExtension = '-' + extension;
		} else {
			sourceExtension = '-' + extension;
			destinationExtension = '.' + extension;
		}

		source = path.resolve(sourceArg);
		await checkPath(source, 'source');

		if (typeof destinationArg === 'string') {
			destination = path.resolve(destinationArg);
			await checkPath(destination, 'destination');
		} else {
			destination = sourceIsSingleItem()
				? path.parse(source).dir
				: source;
		}
	},

	get currentSegment() {
		return pathSegments[pathSegments.length - 1];
	},

	get currentDeepestItemPath() {
		let currentDeepestItemPath = '';
		let isDeepestItem = false;
		for (let i = pathSegments.length - 1; i >= 0; i--) {
			const segment = pathSegments[i];
			if (segment.endsWith(sourceExtension)) {
				if (!isDeepestItem) isDeepestItem = true;
				else break;
			}

			if (!isDeepestItem) continue;
			currentDeepestItemPath = path.join(segment, currentDeepestItemPath);
		}

		return currentDeepestItemPath;
	},

	get source() {
		return path.join(source, ...pathSegments);
	},

	get destination() {
		return path.join(destination, ...pathSegments)
			.replace(new RegExp('\\' + sourceExtension, 'g'), destinationExtension);
	},

	get pathString() {
		return path.join(...pathSegments);
	},

	async forEachSourceFile(callback: () => Promise<void>) {
		if (sourceIsSingleItem()) {
			pathSegments.push(path.parse(source).base);
			source = path.parse(source).dir;
			await callback();
		} else if (sourceIsDirectoryOfItems()) {
			await iterateOverDirectory(callback);
		} else {
			throwSourceInvalid();
		}
	},

	pushSegment(segment: string) {
		pathSegments.push(segment);
	},

	popSegment() {
		return pathSegments.pop();
	},

	inBranchOfDirectory(directoryName: string | RegExp) {
		if (typeof directoryName === 'string') {
			return pathSegments.includes(directoryName);
		} else {
			for (const dir of pathSegments) {
				if (directoryName.test(dir)) return true;
			}
			return false;
		}
	},

	mkdirIfDoesNotExist,
};
