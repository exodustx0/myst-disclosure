import fs, { promises as fsP } from 'fs';

import { Command } from 'commander';

import { NonFatalError, AnomalyError } from './errors.js';

import { pathManager } from './managers/path-manager.js';

import { ReadFile, WriteFile } from './util/file-handle.js';

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
			await pathManager.init('m4s', 'unpack', source, destination);

			const unpacker = new SavegameUnpacker(SavegameUnpacker.command.opts() as Settings);
			await unpacker.run();
		});

	private readonly readFiles: ReadFile[] = [];

	private constructor(
		private readonly settings: Settings,
	) {}

	private get readFile() {
		return this.readFiles[this.readFiles.length - 1];
	}

	private async run() {
		if (this.settings.verbose) console.time('Duration');

		await pathManager.forEachSourceFile(async () => {
			await this.createReadFile(async () => {
				await this.unpackSavegame();
			});
		});

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	////////////
	// SAVEGAME

	private async unpackSavegame() {
		if (
			await this.readFile.readChar8(8) !== 'ubi/b0-l' ||
			await this.readFile.readUInt32() !== 0x3
		) throw new NonFatalError('FILE_CORRUPTED_OR_INVALID', pathManager.pathString, 'savegame');

		const title = await this.readFile.readChar16Headered();
		const createdAt = await this.readTimestamp();

		pathManager.pushSegment('thumbnail.jpg');
		const thumbnailSize = await this.readFile.readUInt32();
		await this.writeToFile(thumbnailSize);
		pathManager.popSegment();

		const positionData = await this.readPositionData();

		const stateDataSize = await this.readFile.readUInt32();
		const startOfStateData = this.readFile.bytesRead;
		if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('unknown-1 != 0');

		const stateClasses = await this.readStateClasses();
		if (this.readFile.bytesRead - startOfStateData !== stateDataSize) throw new AnomalyError('Incorrect state data size');

		const zipPointWorlds = await this.readZipPointWorlds();
		if (await this.readFile.readUInt32() !== positionData.world) throw new AnomalyError('World values are non-identical');
		if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('unknown-2 != 0');

		const foundAmuletHints = await this.readFoundAmuletHints();
		const journalEntries = await this.readJournalEntries();

		pathManager.pushSegment('savegame.json');
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
		pathManager.popSegment();
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
					throw new AnomalyError(`Unrecognized StateType 0x${(state.type as number).toString(16).toUpperCase()}`);
			}

			states.push(state);
		}

		return states;
	}

	private async readStateUnknowns() {
		const numUnknowns = await this.readFile.readUInt32();
		if (numUnknowns !== 0) throw new AnomalyError('stateClasses.unknowns != 0');

		const unknowns: Savegame.Unknown[] = [];
		for (let i = 0; i < numUnknowns; i++) {
			unknowns.push({
				name: await this.readFile.readCharEncHeadered(),
			});
			if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('stateClasses.unknowns.unknown-1 !=');
			if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('stateClasses.unknowns.unknown-2 !=');
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
		pathManager.pushSegment('journal');

		const journalEntries: Savegame.JournalEntry[] = [];
		for (let i = 0; i < 999; i++) {
			const text = await this.readFile.readChar16Headered();
			const hasPhoto = await this.readFile.readBool();
			if (hasPhoto) {
				pathManager.pushSegment(`${i.toString().padStart(3, '0')}.jpg`);
				const photoSize = await this.readFile.readUInt32();
				await this.writeToFile(photoSize);
				pathManager.popSegment();
			}

			const nextPageExists = await this.readFile.readBool();
			if (nextPageExists || hasPhoto || text.length > 0) {
				journalEntries.push({
					text,
					hasPhoto,
				});
			}
		}

		pathManager.popSegment();

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

		let sourcePath = pathManager.source;
		sourcePath = sourcePath.slice(0, sourcePath.indexOf('.m4s') + 4);

		await fsP.access(sourcePath, fs.constants.R_OK)
			.catch(() => { throw new NonFatalError('NO_READ_PERMISSIONS_PATH', sourcePath) });

		this.readFiles.push(await ReadFile.open(sourcePath, start, start + size));

		try {
			await action!();
		} finally {
			await this.readFiles.pop()!.close();
		}
	}

	private async writeToFile(numBytes: number) {
		await pathManager.mkdirIfDoesNotExist();

		const writeFile = await WriteFile.open(pathManager.destination);
		try {
			await this.readFile.transfer(writeFile, numBytes);
		} finally {
			await writeFile.close();
		}
	}

	private async writeToJSON<T extends object>(object: T) {
		await pathManager.mkdirIfDoesNotExist();
		await fsP.writeFile(pathManager.destination, JSON.stringify(object, undefined, '\t'));
	}
}
