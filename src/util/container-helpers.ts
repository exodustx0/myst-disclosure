import type * as Container from '../types/container.js';

export function numFilesInIndex(index: Container.Index) {
	let numFiles = 0;

	if (index.dirs) for (const dirInfo of index.dirs) numFiles += numFilesInIndex(dirInfo.index);
	if (index.files) numFiles += index.files.length;

	return numFiles;
}

export function numBytesInIndex(index: Container.Index) {
	let numBytes = 5;

	if (index.dirs) for (const dirInfo of index.dirs) numBytes += 5 + dirInfo.name.length + numBytesInIndex(dirInfo.index);
	if (index.files) for (const fileInfo of index.files) numBytes += 13 + fileInfo.name.length;

	return numBytes;
}

export function getNextFileFromIndex(index: Container.Index, lastOffset: number) {
	let next: Container.FileInfo | undefined;

	if (index.dirs) {
		for (const dirInfo of index.dirs) {
			const fileInfo = getNextFileFromIndex(dirInfo.index, lastOffset);

			if (fileInfo && fileInfo.offset > lastOffset && (!next || fileInfo.offset < next.offset)) next = fileInfo;
		}
	}

	if (index.files) {
		for (const fileInfo of index.files) {
			if (fileInfo.offset > lastOffset && (!next || fileInfo.offset < next.offset)) next = fileInfo;
		}
	}

	return next;
}
