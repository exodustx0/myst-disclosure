/*
 * uint32 | 0x1 | signature length | 0xB
 * char8  | 0xB | signature        | "UBI_BF_SIG" + NUL
 * uint32 | 0x1 | unknown          | 0x1
 * misc32 | 0x1 | unknown          | 0x0
 * Index  | 0x1 | root index       |
 * data   | ??? | file table       |
 */
export interface JSONFile {
	type: 'container index';
	index: Index;
}

/*
 * uint8    | 0x1  | subdirectory count           | [aa]
 * DirInfo  | [aa] | subdirectory info structures |
 * uint32   | 0x1  | file count                   | [ab]
 * FileInfo | [ab] | file info structures         |
 */
export interface Index {
	dirs?: DirInfo[];
	files?: FileInfo[];
}

/*
 * uint32 | 0x1  | name length | [ba]
 * char8  | [ba] | name        | ends with NUL (included in length)
 * Dir    | 0x1  | index       |
 */
export interface DirInfo {
	name: string;
	index: Index;
}

/*
 * uint32 | 0x1  | name length | [ca]
 * char8  | [ca] | name        | ends with NUL (included in length)
 * uint32 | 0x1  | size        |
 * uint32 | 0x1  | offset      | relative to start of file
 */
export interface FileInfo {
	name: string;
	size: number;
	offset: number;
	tempPath?: string;
}
