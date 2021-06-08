/*
 * char8    | 0x8  | signature        | "ubi/b0-l"
 * uint32   | 0x1  | internal type    | 0x25
 * uint32   | 0x1  | unknown          | 0x1
 * uint32   | 0x1  | file name length | [aa]
 * char8enc | [aa] | file name        | same as file's actual filename without extension
 * uint32   | 0x1  | unknown          | 0x1
 * uint32   | 0x1  | label count      | [ab]
 * uint32   | 0x1  | group count      | [ac]
 * Label    | [ab] | labels           |
 * Group    | [ac] | groups           |
 */
export interface JSONFile {
	type: 'labels';
	labels: Label[];
	groups: Group[];
}

/*
 * uint32 | 0x1  | name length | [ca]
 * char8  | [ca] | name        |
 * uint32 | 0x1  | text length | [cb]
 * char16 | [cb] | text        |
 */
export interface Label {
	name: string;
	text: string;
}

/*
 * uint32 | 0x1  | name length               | [ba]
 * char8  | [ba] | name                      |
 * uint32 | 0x1  | label count               | [bb]
 * misc32 | 0x1  | unknown (subgroup count?) | 0x0
 * Label  | [bb] | labels                    |
 */
export interface Group {
	name: string;
	labels: Label[];
}