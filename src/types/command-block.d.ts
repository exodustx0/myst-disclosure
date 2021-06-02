/*
 * char8    | 0x8  | signature         | "ubi/b0-l"
 * uint32   | 0x1  | internal type     | 0x6
 * uint32   | 0x1  | internal sub-type | 0x1
 * uint32   | 0x1  | file name length  | [aa]
 * char8enc | [aa] | file name         | same as file's actual filename without extension
 * uint32   | 0x1  | command count     | [ab]
 * Command  | [ab] | commands          |
 */
export interface JSONFile {
	type: 'command block';
	commands: Command[];
}

/*
 * uint32   | 0x1  | command length | [ba]
 * char8enc | [ba] | command        |
 */
export type Command = string;
