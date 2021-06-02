/*
 * uint32 | 0x1 | signature length | 0xB
 * char8  | 0xB | signature        | "UBI_BF_SIG" + NUL
 * uint32 | 0x1 | unknown          | 0x1
 * uint32 | 0x1 | unknown          | 0x0
 * Index  | 0x1 | root index       |
 * data   | ??? | file table       |
 */
export interface JSONFile {
	type: 'container index';
	index: Index;
}

/*
 * uint8    | 0x1  | number of subdirectories     | [aa]
 * DirInfo  | [aa] | subdirectory info structures |
 * uint32   | 0x1  | number of files              | [ab]
 * FileInfo | [ab] | file info structures         |
 */
export interface Index {
	dirs: DirInfo[];
	files: FileInfo[];
}

/*
 * uint32 | 0x1  | directory name length | [ba]
 * char8  | [ba] | directory name        | ends with NUL (included in length)
 * Dir    | 0x1  | directory index       |
 */
export interface DirInfo {
	name: string;
	index: Index;
}

/*
 * uint32 | 0x1  | file name length | [ca]
 * char8  | [ca] | file name        | ends with NUL (included in length)
 * uint32 | 0x1  | file size        |
 * uint32 | 0x1  | file offset      | relative to start of file
 */
export interface FileInfo {
	name: string;
	size: number;
	offset: number;
	tempPath?: string;
}

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
