/*
 * char8    | 0x8  | signature           | "ubi/b0-l"
 * uint32   | 0x1  | internal type       | 0x27
 * uint32   | 0x1  | unknown             | 0x2
 * uint32   | 0x1  | file name length    | [aa]
 * char8enc | [aa] | file name           | same as file's actual filename without extension
 * uint8    | 0x1  | localized           | bool (0 or 1)
 * if (localized) {
 * uint32   | 0x1  | texture path length | [ba]
 * char8    | [ba] | texture path        | 
 * } else {
 * uint32   | 0x1  | image format length | [ca]
 * char8enc | [ca] | image format        | "png"
 * uint32   | 0x1  | image size          | [cb]
 * data     | [cb] | image               |
 * }
 * 
 * NOTE: localized textures are stored as raw PNG, not wrapped in .bin
 */
export interface JSONFile {
	type: 'localized texture reference';
	path: string;
}
