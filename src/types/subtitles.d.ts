/*
 * char8    | 0x8  | signature                           | "ubi/b0-l"
 * uint32   | 0x1  | internal type                       | 0x24
 * uint32   | 0x1  | unknown                             | 0x1
 * uint32   | 0x1  | file name length                    | [aa]
 * char8enc | [aa] | file name                           | same as file's actual filename without extension
 * uint32   | 0x1  | unknown (related sound file count?) | 0x1
 * uint32   | 0x1  | related sound file name length      | [ab]
 * char8    | [ab] | related sound file name             |
 * uint32   | 0x1  | subtitle count                      | [ac]
 * Subtitle | [ac] | subtitles                           |
 */
export interface JSONFile {
	type: 'subtitles';
	relatedSoundFile: string;
	subtitles: Subtitle[];
}

/*
 * float  | 0x1  | start time      |
 * float  | 0x1  | end time        |
 * uint32 | 0x1  | subtitle length | [ba]
 * char16 | [ba] | subtitle        |
 */
export interface Subtitle {
	start: number;
	end: number;
	text?: string;
}
