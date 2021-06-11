/*
 * char8                 | 0x8  | signature                     | "ubi/b0-l"
 * uint32                | 0x1  | internal type                 | 0x8
 * uint32                | 0x1  | internal sub-type?            | 0x1
 * uint32                | 0x1  | file name length              | [aa]
 * char8enc              | [aa] | file name                     | "node"
 * uint32                | 0x1  | unknown                       | 0x1
 * uint32                | 0x1  | viewport type                 | 0x1 = free, 0x2 = fixed
 * float32               | 0x6  | unknown                       |
 * uint32                | 0x1  | camera direction setter count | [ab]
 * CameraDirectionSetter | [ab] | camera direction setters      |
 */
export interface JSONFile {
	type: 'node';
	viewportFree: boolean;
	cameraDirectionSetters: CameraDirectionSetter[];
}

/*
 * uint32   | 0x1  | entry point length | [ba]
 * char8enc | [ba] | entry point        | "zip" or "wXzYYnZZZ"
 * float32  | 0x1  | pitch              |
 * float32  | 0x1  | yaw                |
 */
export interface CameraDirectionSetter {
	entryPoint: 'zip' | {
		world: number;
		zone: number;
		node: number;
	};
	pitch: number;
	yaw: number;
}
