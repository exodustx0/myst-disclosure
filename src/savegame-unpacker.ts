import fs, { promises as fsP } from 'fs';
import path from 'path';

import { Command } from 'commander';

import { ReadFile, WriteFile } from './util/file-handle.js';
import { resolvePathArguments } from './util/resolve-path-arguments.js';

import * as Savegame from './types/savegame.js';

interface Settings {
	verbose: boolean;
}

export class SavegameUnpacker {
	static command = new Command()
		.command('unpack <source> [destination]')
		.description('unpack one or more savegames')
		.option('-v, --verbose', 'verbose output')
		.action(async (source: string, destination?: string) => {
			[source, destination] = await resolvePathArguments('.m4s', source, destination);

			const unpacker = new SavegameUnpacker(source, destination, SavegameUnpacker.command.opts() as Settings);
			await unpacker.run();
		});

	private readonly path: string[] = [];
	private readonly readFiles: ReadFile[] = [];
	
	private constructor(
		private sourceRoot: string,
		private readonly destinationRoot: string,
		private readonly settings: Settings,
	) {}

	private get sourcePath() {
		return path.join(this.sourceRoot, ...this.path);
	}

	private get destinationPath() {
		return path.join(this.destinationRoot, ...this.path).replace(/\.m4s/g, '-m4s');
	}

	private get pathStr() {
		return path.join(...this.path);
	}

	private get currentSavegamePath() {
		let currentSavegamePath = this.path[this.path.length - 1];
		for (let i = this.path.length - 2; i >= 0; i--) {
			const segment = this.path[i];
			if (segment.endsWith('.m4s')) break;
			currentSavegamePath = path.join(segment, currentSavegamePath);
		}

		return currentSavegamePath;
	}

	private get readFile() {
		return this.readFiles[this.readFiles.length - 1];
	}

	private async run() {
		if (this.settings.verbose) console.time('Duration');

		const sourceEntry = await fsP.stat(this.sourceRoot);

		if (sourceEntry.isFile() && this.sourceRoot.endsWith('.m4s')) {
			this.path.push(path.parse(this.sourceRoot).base);
			this.sourceRoot = path.parse(this.sourceRoot).dir;
			await this.createReadFile(async () => {
				await this.unpackSavegame();
			});
		} else if (sourceEntry.isDirectory() && !this.sourceRoot.endsWith('.m4s')) {
			await this.checkDir(true);
		} else {
			throw 'Source must be a savegame file or a directory containing savegame files.';
		}

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	private async checkDir(root = false) {
		const dir = (await fsP.readdir(this.sourcePath, { withFileTypes: true }))
			.filter(entry => (entry.isDirectory() && !entry.name.startsWith('.m4s')) || (entry.isFile() && entry.name.endsWith('.m4s')));

		if (root && !dir.some(entry => entry.name.endsWith('.m4s'))) throw 'No .m4s files in source directory.';

		for (const entry of dir) {
			this.path.push(entry.name);

			if (entry.isFile()) {
				await this.createReadFile(async () => {
					await this.unpackSavegame();
				});
			} else {
				await this.checkDir();
			}

			this.path.pop();
		}
	}

	////////////
	// SAVEGAME

	private async unpackSavegame() {
		if (
			await this.readFile.readChar8(8) !== 'ubi/b0-l' ||
			await this.readFile.readUInt32() !== 0x3
		) throw `"${this.pathStr}" is either corrupted or an invalid Myst IV savegame file.`;

		const title = await this.readFile.readChar16Headered();
		const createdAt = await this.readTimestamp();

		this.path.push('thumbnail.jpg');
		const thumbnailSize = await this.readFile.readUInt32();
		await this.writeToFile(thumbnailSize);
		this.path.pop();

		const positionData = await this.readPositionData();

		await this.readFile.skip(8); // size and unknown

		const stateClasses = await this.readStateClasses();
		const zipPointWorlds = await this.readZipPointWorlds();
		const world = await this.readFile.readUInt32();
		if (world !== positionData.world) console.log(`"${this.currentSavegamePath}" has non-identical world values. Please open an issue on GitHub or tell the developers on Discord, with a copy of this savegame file!`);

		await this.readFile.skip(4); // unknown

		const foundAmuletHints = await this.readFoundAmuletHints();
		const journalEntries = await this.readJournalEntries();

		await this.writeToJSON<Savegame.JSONFile>({
			type: 'savegame',
			title,
			createdAt,
			positionData,
			stateClasses,
			zipPointWorlds,
			foundAmuletHints,
			journalEntries,
		});
	}

	private async readTimestamp(): Promise<Savegame.Timestamp> {
		const day = await this.readFile.readUInt32();
		const dst = await this.readFile.readUInt32();
		const hour = await this.readFile.readUInt32();
		const ms = await this.readFile.readUInt32();
		const minute = await this.readFile.readUInt32();
		const month = await this.readFile.readUInt32() - 1;
		const second = await this.readFile.readUInt32();
		const year = await this.readFile.readUInt32();

		return {
			date: new Date(year, month, day, hour, minute, second, ms),
			dst,
		};
	}

	private async readPositionData(): Promise<Savegame.PositionData> {
		return {
			world: await this.readFile.readUInt32(),
			zone: await this.readFile.readUInt32(),
			node: await this.readFile.readUInt32(),
			viewport: {
				borderLeft: await this.readFile.readFloat(),
				borderBottom: await this.readFile.readFloat(),
				width: await this.readFile.readFloat(),
				height: await this.readFile.readFloat(),
			},
			camera: [
				[
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
				],
				[
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
				],
				[
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
				],
				[
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
					await this.readFile.readFloat(),
				],
			],
			pitch: await this.readFile.readFloat(),
			yaw: await this.readFile.readFloat(),
		};
	}

	private async readStateClasses() {
		const numStateClasses = await this.readFile.readUInt32();
		const stateClasses: Savegame.StateClass[] = [];
		for (let i = 0; i < numStateClasses; i++) {
			stateClasses.push({
				name: await this.readFile.readCharEncHeadered(),
				states: await this.readStates(),
				unknowns: await this.readStateUnknowns(),
			});
		}

		return stateClasses;
	}

	private async readStates() {
		const numStates = await this.readFile.readUInt32();
		const states: Savegame.State[] = [];
		for (let i = 0; i < numStates; i++) {
			const state: Savegame.State = {
				name: await this.readFile.readCharEncHeadered(),
				type: await this.readFile.readUInt8(),
			};

			switch (state.type) {
				case Savegame.StateType.UInt8:
					state.value = await this.readFile.readUInt8(); break;
				case Savegame.StateType.UInt32:
					state.value = await this.readFile.readUInt32(); break;
				case Savegame.StateType.Int8:
					state.value = await this.readFile.readInt8(); break;
				case Savegame.StateType.Int32:
					state.value = await this.readFile.readInt32(); break;
				case Savegame.StateType.Float:
					state.value = await this.readFile.readFloat(); break;
				case Savegame.StateType.Bool:
					state.value = await this.readFile.readBool(); break;
				case Savegame.StateType.Unknown:
					state.value = [
						await this.readFile.readFloat(),
						await this.readFile.readFloat(),
						await this.readFile.readFloat(),
					];
					break;
				case Savegame.StateType.Char8:
					state.value = await this.readFile.readChar8Headered(); break;
				default:
					throw `"${this.currentSavegamePath}" contains a state with type 0x${(state.type as number).toString(16).toUpperCase()}. Please open an issue on GitHub with this!`;
			}

			states.push(state);
		}

		return states;
	}

	private async readStateUnknowns() {
		const numUnknowns = await this.readFile.readUInt32();
		const unknowns: Savegame.StateUnknown[] = [];
		for (let i = 0; i < numUnknowns; i++) {
			unknowns.push({
				name: await this.readFile.readCharEncHeadered(),
			});
			await this.readFile.skip(8); // unknown
		}

		return unknowns.length > 0 ? unknowns : undefined;
	}

	private async readZipPointWorlds() {
		const numWorlds = await this.readFile.readUInt32();
		const zipPointWorlds: Savegame.ZipPointWorld[] = [];
		for (let i = 0; i < numWorlds; i++) {
			zipPointWorlds.push({
				world: await this.readFile.readUInt32(),
				zipPoints: await this.readZipPoints(),
			});
		}

		return zipPointWorlds;
	}

	private async readZipPoints() {
		const numZipPoints = await this.readFile.readUInt32();
		const zipPoints: Savegame.ZipPoint[] = [];
		for (let i = 0; i < numZipPoints; i++) {
			let order: number;
			zipPoints.push({
				zone: await this.readFile.readUInt32(),
				node: await this.readFile.readUInt32(),
				order: (order = await this.readFile.readInt32()) === -1 ? undefined : order,
				enabled: await this.readFile.readBool(),
			});
		}

		return zipPoints;
	}

	private async readFoundAmuletHints() {
		const numFoundAmuletHints = await this.readFile.readUInt32();
		const foundAmuletHints: Savegame.FoundAmuletHint[] = [];
		for (let i = 0; i < numFoundAmuletHints; i++) {
			foundAmuletHints.push({
				world: await this.readFile.readUInt32(),
				zone: await this.readFile.readUInt32(),
				node: await this.readFile.readUInt32(),
			});
		}

		return foundAmuletHints;
	}

	private async readJournalEntries() {
		const journalEntries: Savegame.JournalEntry[] = [];
		for (let i = 0; i < 999; i++) {
			const text = await this.readFile.readChar16Headered();
			const hasPhoto = await this.readFile.readBool();
			if (hasPhoto) {
				this.path.push('journal', `${i.toString().padStart(3, '0')}.jpg`);
				const photoSize = await this.readFile.readUInt32();
				await this.writeToFile(photoSize);
				this.path.pop();
				this.path.pop();
			}

			const nextPageExists = await this.readFile.readBool();
			if (nextPageExists || hasPhoto || text.length > 0) {
				journalEntries.push({
					text,
					hasPhoto,
				});
			}
		}

		return journalEntries;
	}

	///////////
	// UTILITY

	private async createReadFile(action: () => Promise<void>): Promise<void>;
	private async createReadFile(start: number, size: number, action: () => Promise<void>): Promise<void>;
	private async createReadFile(startOrAction: number | (() => Promise<void>), size = Infinity, action?: () => Promise<void>) {
		let start = 0;
		if (typeof startOrAction === 'number') {
			start = startOrAction;
		} else {
			action = startOrAction;
		}

		let sourcePath = this.sourcePath;
		sourcePath = sourcePath.slice(0, sourcePath.indexOf('.m4s') + 4);

		await fsP.access(sourcePath, fs.constants.R_OK)
			.catch(() => { throw `No read permissions for "${sourcePath}".` });

		this.readFiles.push(await ReadFile.open(sourcePath, start, start + size));

		try {
			await action!();
		} finally {
			await this.readFiles.pop()!.close();
		}
	}

	private mkdirIfDoesNotExist(recursive = false) {
		return new Promise<void>((resolve, reject) => {
			const destinationPath = path.parse(this.destinationPath).dir;
			fsP.access(destinationPath, fs.constants.F_OK)
				.then(() => {
					fsP.access(destinationPath, fs.constants.W_OK).then(resolve).catch(() => reject(`No write permissions for "${destinationPath}".`));
				}).catch(() => {
					fsP.mkdir(destinationPath, { recursive }).then(() => resolve()).catch(reject);
				});
		});
	}

	private async writeToFile(numBytes: number) {
		await this.mkdirIfDoesNotExist(true);

		const writeFile = await WriteFile.open(this.destinationPath);
		try {
			await this.readFile.transfer(writeFile, numBytes);
		} finally {
			await writeFile.close();
		}
	}

	private async writeToJSON<T extends object>(object: T) {
		await this.mkdirIfDoesNotExist(true);
		await fsP.writeFile(this.destinationPath + '.json', JSON.stringify(object, undefined, '\t'));
	}
}
