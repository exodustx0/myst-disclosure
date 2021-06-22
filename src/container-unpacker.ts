import fs, { promises as fsP } from 'fs';
import path from 'path';

import { Command } from 'commander';

import { NonFatalError, AnomalyError } from './errors.js';

import { numFilesInIndex, getNextFileFromIndex } from './util/container-helpers.js';
import { ReadFile, WriteFile } from './util/file-handle.js';
import { mkdirIfDoesNotExist } from './util/mkdir-if-does-not-exist.js';
import { ProgressLogger } from './util/progress-logger.js';
import { resolvePathArguments } from './util/resolve-path-arguments.js';

import type * as Container from './types/container.js';
import type * as CommandBlock from './types/command-block.js';
import type * as Texture from './types/texture.js';
import type * as Subtitles from './types/subtitles.js';
import type * as Labels from './types/labels.js';

interface Settings {
	verbose: boolean;
	indexOnly: boolean;
	skipLogFiles: boolean;
}

export class ContainerUnpacker {
	static command = new Command()
		.command('unpack <source> [destination]')
		.description('unpack one or more containers')
		.option('-v, --verbose', 'verbose output')
		.option('-i, --index-only', 'only unpack the index of containers')
		.option('-L, --skip-log-files', 'skip unpacking of .log files')
		.action(async (source: string, destination?: string) => {
			[source, destination] = await resolvePathArguments('.m4b', source, destination);

			const unpacker = new ContainerUnpacker(source, destination, ContainerUnpacker.command.opts() as Settings);
			await unpacker.run();
		});

	private readonly path: string[] = [];
	private readonly readFiles: ReadFile[] = [];
	private readonly progressLogger?: ProgressLogger;

	private constructor(
		private sourceRoot: string,
		private readonly destinationRoot: string,
		private readonly settings: Settings,
	) {
		if (this.settings.verbose) this.progressLogger = new ProgressLogger();
	}

	private get sourcePath() {
		return path.join(this.sourceRoot, ...this.path);
	}

	private get destinationPath() {
		return path.join(this.destinationRoot, ...this.path).replace(/\.m4b/g, '-m4b');
	}

	private get pathStr() {
		return path.join(...this.path);
	}

	private get currentContainerPath() {
		let currentContainerPath = this.path[this.path.length - 1];
		for (let i = this.path.length - 2; i >= 0; i--) {
			const segment = this.path[i];
			if (segment.endsWith('.m4b')) break;
			currentContainerPath = path.join(segment, currentContainerPath);
		}

		return currentContainerPath;
	}

	private get readFile() {
		return this.readFiles[this.readFiles.length - 1];
	}

	private async run() {
		if (this.settings.verbose) console.time('Duration');

		const sourceEntry = await fsP.stat(this.sourceRoot);

		if (sourceEntry.isFile() && this.sourceRoot.endsWith('.m4b')) {
			this.path.push(path.parse(this.sourceRoot).base);
			this.sourceRoot = path.parse(this.sourceRoot).dir;
			await this.createReadFile(async () => {
				await this.unpackContainer();
			});
		} else if (sourceEntry.isDirectory() && !this.sourceRoot.endsWith('.m4b')) {
			await this.checkDir(true);
		} else {
			throw new NonFatalError('SOURCE_INVALID_UNPACK', 'm4b');
		}

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	private async checkDir(root = false) {
		const dir = (await fsP.readdir(this.sourcePath, { withFileTypes: true }))
			.filter(entry => (entry.isDirectory() && !entry.name.startsWith('.m4b')) || (entry.isFile() && entry.name.endsWith('.m4b')));

		if (root && !dir.some(entry => entry.name.endsWith('.m4b'))) throw new NonFatalError('SOURCE_INVALID_UNPACK', 'm4b');

		for (const entry of dir) {
			this.path.push(entry.name);

			if (entry.isFile()) {
				await this.createReadFile(async () => {
					await this.unpackContainer();
				});
			} else {
				await this.checkDir();
			}

			this.path.pop();
		}
	}

	/////////////
	// CONTAINER

	private async unpackContainer(startOfContainer = 0) {
		const signatureLength = await this.readFile.readUInt32();
		const signature = await this.readFile.readChar8(0xB);
		if (signatureLength !== 0xB || signature !== 'UBI_BF_SIG\0') throw new NonFatalError('FILE_CORRUPTED_OR_INVALID', this.pathStr, 'container');
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-1 != 1');
		if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('unknown-2 != 0');

		const index = await this.readIndex();
		this.validateIndex(index);

		if (this.settings.verbose) this.progressLogger!.levelUp(numFilesInIndex(index), this.currentContainerPath);

		if (this.settings.indexOnly) {
			await this.writeToJSON<Container.JSONFile>({
				type: 'container index',
				index,
			});

			for (const fileInfo of this.files(index)) {
				const extension = path.parse(fileInfo.name).ext.slice(1);
				if (extension === 'm4b') {
					fileInfo.offset += startOfContainer;
					await this.createReadFile(fileInfo.offset, fileInfo.size, async () => {
						await this.unpackContainer(fileInfo.offset);
					});
				}

				if (this.settings.verbose) this.progressLogger!.tick();
			}

			return;
		}

		await this.unpackFiles(index, startOfContainer);
	}

	private async readIndex() {
		const numSubDirs = await this.readFile.readUInt8();
		const subDirs: Container.DirInfo[] = [];
		for (let subDirIndex = 0; subDirIndex < numSubDirs; subDirIndex++) {
			subDirs.push({
				name: (await this.readFile.readChar8Headered()).slice(0, -1),
				index: await this.readIndex(),
			});
		}

		const numFiles = await this.readFile.readUInt32();
		const files: Container.FileInfo[] = [];
		for (let fileIndex = 0; fileIndex < numFiles; fileIndex++) {
			const fileInfo: Container.FileInfo = {
				name: (await this.readFile.readChar8Headered()).slice(0, -1),
				size: await this.readFile.readUInt32(),
				offset: await this.readFile.readUInt32(),
			};

			if (!fileInfo.name.endsWith('.log') || !this.settings.skipLogFiles) files.push(fileInfo);
		}

		const index: Container.Index = {};
		if (subDirs.length > 0) index.dirs = subDirs;
		if (files.length > 0) index.files = files;

		return index;
	}

	private validateIndex(index: Container.Index) {
		const numFiles = numFilesInIndex(index);
		if (numFiles === 0) throw new AnomalyError('No files');

		let offset = 0;
		let a = getNextFileFromIndex(index, offset)!;
		for (let i = 0; i < numFiles - 1; i++) {
			offset = a.offset;
			const b = getNextFileFromIndex(index, offset)!;

			if (a.offset + a.size !== b.offset) {
				throw new AnomalyError(
					a.offset + a.size < b.offset
						? 'File table contains slack space'
						: 'File table contains truncated files',
				);
			}

			a = b;
		}
	}

	private async unpackFiles(index: Container.Index, startOfContainer: number) {
		for (const fileInfo of this.files(index)) {
			fileInfo.offset += startOfContainer;
			await this.createReadFile(fileInfo.offset, fileInfo.size, async () => {
				const extension = path.parse(fileInfo.name).ext.slice(1);
				switch (extension) {
					case 'm4b':
						await this.unpackContainer(fileInfo.offset);
						break;

					case 'bin':
						if (this.inBranchOfDirectory(/^command_?blocks?$/)) {
							await this.readCommandBlockFile();
						} else if (this.inBranchOfDirectory('textures')) {
							await this.readTexturesFile();
						} else if (this.inBranchOfDirectory('subtitle')) {
							await this.readSubtitlesFile();
						} else if (this.inBranchOfDirectory('text')) {
							await this.readLabelsFile();
						} else {
							await this.writeToFile();
						}
						break;

					default: await this.writeToFile(); break;
				}
			});

			if (this.settings.verbose) this.progressLogger!.tick();
		}
	}

	////////////////
	// FILE READERS

	private async readSignature(type: string) {
		const signature = await this.readFile.readChar8(8);
		if (signature !== 'ubi/b0-l') throw new NonFatalError('FILE_CORRUPTED_OR_INVALID', this.pathStr, type);
	}

	private async readInternalFileName() {
		const filename = await this.readFile.readCharEncHeadered();
		if (filename !== path.parse(this.path[this.path.length - 1]).name) throw new AnomalyError('internal file name != file name');
	}

	private async readCommandBlockFile() {
		await this.readSignature('command block');
		if (await this.readFile.readUInt32() !== 0x6) throw new AnomalyError('type != 0x6');
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-1 != 1');
		await this.readInternalFileName();

		const commands: string[] = [];
		const numCommands = await this.readFile.readUInt32();
		if (numCommands === 0) throw new AnomalyError('No commands');

		for (let cmdIndex = 0; cmdIndex < numCommands; cmdIndex++) commands.push(await this.readFile.readCharEncHeadered());

		await this.writeToJSON<CommandBlock.JSONFile>({
			type: 'command block',
			commands,
		});
	}

	private async readTexturesFile() {
		await this.readSignature('textures');
		if (await this.readFile.readUInt32() !== 0x27) throw new AnomalyError('type != 0x27');
		if (await this.readFile.readUInt32() !== 2) throw new AnomalyError('unknown-1 != 2');
		await this.readInternalFileName();
		const localized = await this.readFile.readUInt8() === 1;

		if (localized) {
			await this.writeToJSON<Texture.JSONFile>({
				type: 'localized texture reference',
				path: await this.readFile.readChar8Headered(),
			});
		} else {
			if (await this.readFile.readCharEncHeadered() !== 'png') throw new AnomalyError('image format != "png"');
			if (await this.readFile.readUInt32() !== this.readFile.bytesRemaining) throw new AnomalyError('image size != actual size');
			await this.writeToFile('.png');
		}
	}

	private async readSubtitlesFile() {
		await this.readSignature('subtitle');
		if (await this.readFile.readUInt32() !== 0x24) throw new AnomalyError('type != 0x24');
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-1 != 1');
		await this.readInternalFileName();
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-2 != 1');

		const relatedSoundFile = await this.readFile.readChar8Headered();
		const subtitles: Subtitles.Subtitle[] = [];
		const numSubtitles = await this.readFile.readUInt32();
		if (numSubtitles === 0) throw new AnomalyError('No subtitle parts');
		
		let sceneLength = 0;
		for (let subtitleIndex = 0; subtitleIndex < numSubtitles; subtitleIndex++) {
			const subtitle: Subtitles.Subtitle = { start: await this.readFile.readFloat() };

			if (subtitleIndex > 0 && sceneLength !== subtitle.start) throw new AnomalyError('Gaps between subtitle parts');
			sceneLength = await this.readFile.readFloat();

			const text = await this.readFile.readChar16Headered();
			if (text.length > 0) subtitle.text = text;

			subtitles.push(subtitle);
		}

		await this.writeToJSON<Subtitles.JSONFile>({
			type: 'subtitles',
			relatedSoundFile,
			sceneLength,
			subtitles,
		});
	}

	private async readLabelsFile() {
		await this.readSignature('labels');
		if (await this.readFile.readUInt32() !== 0x25) throw new AnomalyError('type != 0x25');
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-1 != 1');
		await this.readInternalFileName();
		if (await this.readFile.readUInt32() !== 1) throw new AnomalyError('unknown-2 != 1');

		let numLabels = await this.readFile.readUInt32();
		const numGroups = await this.readFile.readUInt32();

		const labels = await this.readLabels(numLabels);
		const groups: Labels.Group[] = [];
		for (let groupIndex = 0; groupIndex < numGroups; groupIndex++) {
			const name = await this.readFile.readChar8Headered();
			numLabels = await this.readFile.readUInt32();
			if (await this.readFile.readUInt32() !== 0) throw new AnomalyError('groups.unknown != 0');

			groups.push({
				name,
				labels: await this.readLabels(numLabels),
			});
		}

		if (labels.length === 0 && groups.length === 0) throw new AnomalyError('No labels');

		const json: Labels.JSONFile = { type: 'labels' };
		if (labels.length > 0) json.labels = labels;
		if (groups.length > 0) json.groups = groups;

		await this.writeToJSON<Labels.JSONFile>(json);
	}

	private async readLabels(numLabels: number) {
		const labels: Labels.Label[] = [];
		for (let labelIndex = 0; labelIndex < numLabels; labelIndex++) {
			labels.push({
				name: await this.readFile.readChar8Headered(),
				text: await this.readFile.readChar16Headered(),
			});
		}

		return labels;
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
		sourcePath = sourcePath.slice(0, sourcePath.indexOf('.m4b') + 4);

		await fsP.access(sourcePath, fs.constants.R_OK)
			.catch(() => { throw new NonFatalError('NO_READ_PERMISSIONS_PATH', sourcePath) });

		this.readFiles.push(await ReadFile.open(sourcePath, start, start + size));

		try {
			await action!();
		} finally {
			await this.readFiles.pop()!.close();
		}
	}

	private inBranchOfDirectory(directoryName: string | RegExp) {
		if (typeof directoryName === 'string') {
			return this.path.includes(directoryName);
		} else {
			for (const dir of this.path) {
				if (directoryName.test(dir)) return true;
			}
			return false;
		}
	}

	private *files(index: Container.Index): Generator<Container.FileInfo> {
		if (index.dirs) {
			for (const dirInfo of index.dirs) {
				this.path.push(dirInfo.name);
				yield* this.files(dirInfo.index);
				this.path.pop();
			}
		}

		if (index.files) {
			for (const fileInfo of index.files) {
				this.path.push(fileInfo.name);
				yield fileInfo;
				this.path.pop();
			}
		}
	}

	private async writeToFile(newExtension = '') {
		await mkdirIfDoesNotExist(path.parse(this.destinationPath).dir, true);

		const writeFile = await WriteFile.open(this.destinationPath + newExtension);
		try {
			await this.readFile.transfer(writeFile);
		} finally {
			await writeFile.close();
		}
	}

	private async writeToJSON<T extends object>(object: T) {
		await mkdirIfDoesNotExist(path.parse(this.destinationPath).dir, true);
		await fsP.writeFile(this.destinationPath + '.json', JSON.stringify(object, undefined, '\t'));
	}
}
