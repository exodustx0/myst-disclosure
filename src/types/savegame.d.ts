import type { FixedLengthArray } from 'type-fest';

/*
 * char8           | 0x8   | signature               | "ubi/b0-l"
 * uint32          | 0x1   | internal type           | 0x3
 * uint32          | 0x1   | title length            | [aa]
 * char16          | [aa]  | title                   |
 * Timestamp       | 0x1   | time of creation        |
 * uint32          | 0x1   | thumbnail size          | [ab]
 * data            | [ab]  | thumbnail               |
 * PositionData    | 0x1   | position data           |
 * uint32          | 0x1   | size of next 3 items    |
 * uint32          | 0x1   | unknown                 | 0x0
 * uint32          | 0x1   | state class count       | [ac]
 * StateClass      | [ac]  | state classes           |
 * uint32          | 0x1   | zip point world count   | [ad]
 * WorldZips       | [ad]  | zip point worlds        |
 * uint32          | 0x1   | world(?)                |
 * uint32          | 0x1   | unknown                 | 0x0
 * uint32          | 0x1   | found amulet hint count | [ae]
 * FoundAmuletHint | [ae]  | found amulet hints      |
 * JournalEntry    | 0x3E7 | journal entries         |
 * uint32          | 0x1   | checksum                | sum of all bytes
 */
export interface JSONFile {
	type: 'savegame';
	title: string;
	createdAt: Timestamp;
	positionData: PositionData;
	stateClasses: StateClass[];
	zipPointWorlds: WorldZips[];
	foundNecklaceHints: FoundAmuletHint[];
	journalEntries: JournalEntry[];
}

/*
 * uint32 | 0x1 | day
 * uint32 | 0x1 | DST
 * uint32 | 0x1 | hour
 * uint32 | 0x1 | millisecond
 * uint32 | 0x1 | minute
 * uint32 | 0x1 | month
 * uint32 | 0x1 | second
 * uint32 | 0x1 | year
 */
export type Timestamp = Date;

/*
 * uint32 | 0x1  | world                                |
 * uint32 | 0x1  | zone                                 |
 * uint32 | 0x1  | node                                 |
 * float  | 0x1  | viewport left border                 | range 0.0–1.0, default 0.0, relative to screen size
 * float  | 0x1  | viewport bottom border               | range 0.0–1.0, default 0.175, relative to screen size
 * float  | 0x1  | viewport width                       | range 0.0–1.0, default 1.0, relative to screen size
 * float  | 0x1  | viewport height                      | range 0.0–1.0, default 0.75, relative to screen size
 * float  | 0x10 | camera position/direction 4x4 matrix |
 * float  | 0x1  | pitch                                |
 * float  | 0x1  | yaw                                  |
 */
export interface PositionData {
	world: number;
	zone: number;
	node: number;
	viewport: {
		borderLeft: number;
		borderBottom: number;
		width: number;
		height: number;
	};
	camera: FixedLengthArray<FixedLengthArray<number, 4>, 4>;
	pitch: number;
	yaw: number;
}

/*
 * uint32   | 0x1  | name length | [ba]
 * char8enc | [ba] | name        |
 * uint32   | 0x1  | state count | [bb]
 * State    | [bb] | states      |
 * uint32   | 0x1  | unknown     | 0x0
 */
export interface StateClass {
	name: string;
	states: State[];
}

/*
 * uint32    | 0x1  | name length  | [ca]
 * char8enc  | [ca] | name         |
 * uint8     | 0x1  | type         | [cb]
 * switch (type) {
 * case 0x1:
 * uint8     | 0x1  | value        |
 * case 0x3:
 * uint32    | 0x1  | value        |
 * case 0x4:
 * int8      | 0x1  | value        |
 * case 0x6:
 * int32     | 0x1  | value        |
 * case 0x7:
 * float     | 0x1  | value        |
 * case 0x9:
 * uint8     | 0x1  | value        | bool (0 or 1)
 * case 0x11:
 * unknown96 | 0x1  | value        |
 * case 0x13:
 * uint32    | 0x1  | value length | [cc]
 * char8     | [cc] | value        |
 * }
 */
export interface State<TStateType extends StateType> {
	name: string;
	type: TStateType;
	value: TStateType extends (
		| StateType.UInt8
		| StateType.UInt32
		| StateType.Int8
		| StateType.Int32
		| StateType.Float
	) ? number :
		TStateType extends StateType.Bool ? boolean :
			TStateType extends StateType.Unknown ? FixedLengthArray<number, 3> :
				TStateType extends StateType.Char8 ? string : never;
}

export enum StateType {
	UInt8 = 1,
	UInt32 = 3,
	Int8 = 4,
	Int32 = 6,
	Float = 7,
	Bool = 9,
	Unknown = 11,
	Char8 = 13,
}

/*
 * uint32   | 0x1  | world           |
 * uint32   | 0x1  | zip point count | [da]
 * ZipPoint | [da] | zip points      |
 */
export interface WorldZips {
	world: number;
	zipPoints: ZipPoint[];
}

/*
 * uint32 | 0x1 | zone           |
 * uint32 | 0x1 | node           |
 * int32  | 0x1 | order position | -1 == unvisited
 * uint8  | 0x1 | enabled        | bool (0 or 1)
 */
export interface ZipPoint {
	zone: number;
	node: number;
	order?: number;
	enabled: boolean;
}

/*
 * uint32 | 0x1 | world
 * uint32 | 0x1 | zone
 * uint32 | 0x1 | node
 */
export interface FoundAmuletHint {
	world: number;
	zone: number;
	node: number;
}

/*
 * uint32 | 0x1  | text length              | [ea]
 * char16 | [ea] | text                     |
 * uint8  | 0x1  | has image                | bool (0 or 1)
 * if (has image) {
 * uint32 | 0x1  | photo size               | [eb]
 * data   | [eb] | photo                    |
 * }
 * uint3  | 0x1  | next journal page exists | bool (0 or 1)
 */
export interface JournalEntry {
	text?: string;
	hasImage: boolean;
}
