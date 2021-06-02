/*
 * char8    | 0x8  | signature          | "ubi/b0-l"
 * uint32   | 0x1  | internal type      | 0x8
 * uint32   | 0x1  | internal sub-type  | 0x1
 * uint32   | 0x1  | file name length   | [aa]
 * char8enc | [aa] | file name          | "node"
 * uint32   | 0x1  | unknown            | 0x1
 * uint32   | 0x1  | viewport type      | 0x1 = free, 0x2 = fixed
 * float32  | 0x6  | unknown            |
 * uint32   | 0x1  | number of ??       | [ab]
 * ??       | [ab] | unknown
 */
export interface JSONFile {
	type: 'node';
	viewportFree: boolean;
}

/*
 * {??}
 * uint32   | 0x1  | reference length | [ba]
 * char8enc | [ba] | reference        | "zip" or "wXzYYnZZZ"
 * float32  | 0x2  | unknown          |
 */