import type { Index } from '../types/container.js';

export function numFilesInIndex(index: Index) {
	let numFiles = 0;

	for (const dirInfo of index.dirs) numFiles += numFilesInIndex(dirInfo.index);
	numFiles += index.files.length;

	return numFiles;
}

export function numBytesInIndex(index: Index) {
	let numBytes = 5;

	for (const dirInfo of index.dirs) numBytes += 5 + dirInfo.name.length + numBytesInIndex(dirInfo.index);
	for (const fileInfo of index.files) numBytes += 13 + fileInfo.name.length;

	return numBytes;
}
