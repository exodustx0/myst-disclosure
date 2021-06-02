/*
 * char8    | 0x8  | signature             | "ubi/b0-l"
 * uint32   | 0x1  | internal type         | 0x25
 * uint32   | 0x1  | unknown               | 0x1
 * uint32   | 0x1  | file name length      | [aa]
 * char8enc | [aa] | file name             | same as file's actual filename without extension
 * uint32   | 0x1  | unknown               | 0x1
 * uint32   | 0x1  | number of labels      | [ab]
 * uint32   | 0x1  | number of groups      | [ac]
 * Label    | [ab] | labels                |
 * Group    | [ac] | groups                |
 */
export interface JSONFile {
	type: 'labels';
	labels: Label[];
	groups: Group[];
}

/*
 * uint32 | 0x1  | label name length | [ca]
 * char8  | [ca] | label name        |
 * uint32 | 0x1  | label text length | [cb]
 * char16 | [cb] | label text        |
 */
export interface Label {
	name: string;
	text: string;
}

/*
 * uint32 | 0x1  | group name length    | [ba]
 * char8  | [ba] | group name           |
 * uint32 | 0x1  | number of labels     | [bb]
 * uint32 | 0x1  | unknown (subgroups?) | 0x0
 * Label  | [bb] | labels               |
 */
export interface Group {
	name: string;
	labels: Label[];
}