import fs, { promises as fsP } from 'fs';
import path from 'path';

import { Command } from 'commander';

import { ReadFile, WriteFile } from './util/file-handle.js';
import { ProgressLogger } from './util/progress-logger.js';
import { numFilesInIndex } from './util/container-helpers.js';
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

	constructor(
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

	async run() {
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
			throw 'Source must be a container file or a directory containing container files.';
		}

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	private async checkDir(root = false) {
		const dir = (await fsP.readdir(this.sourcePath, { withFileTypes: true }))
			.filter(entry => (entry.isDirectory() && !entry.name.startsWith('.m4b')) || (entry.isFile() && entry.name.endsWith('.m4b')));

		if (root && !dir.some(entry => entry.name.endsWith('.m4b'))) throw 'No .m4b files in source directory.';

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
		if (signatureLength !== 0xB || signature !== 'UBI_BF_SIG\0') throw `"${this.pathStr}" is either corrupted or an invalid Myst IV container file.`;
		await this.readFile.skip(8); // unknown

		const index = await this.readIndex();

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
		const index: Container.Index = {
			dirs: [],
			files: [],
		};

		const numSubDirs = await this.readFile.readUInt8();
		for (let subDirIndex = 0; subDirIndex < numSubDirs; subDirIndex++) {
			index.dirs.push({
				name: (await this.readFile.readChar8Headered()).slice(0, -1),
				index: await this.readIndex(),
			});
		}

		const numFiles = await this.readFile.readUInt32();
		for (let fileIndex = 0; fileIndex < numFiles; fileIndex++) {
			const fileInfo: Container.FileInfo = {
				name: (await this.readFile.readChar8Headered()).slice(0, -1),
				size: await this.readFile.readUInt32(),
				offset: await this.readFile.readUInt32(),
			};

			if (!fileInfo.name.endsWith('.log') || !this.settings.skipLogFiles) index.files.push(fileInfo);
		}

		return index;
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
		if (signature !== 'ubi/b0-l') throw `"${this.pathStr}" is either corrupted or an invalid ${type} file.`;
	}

	private async readCommandBlockFile() {
		await this.readSignature('command block');
		await this.readFile.skip(8); // type and sub-type
		await this.readFile.readCharEncHeadered(); // copy of filename

		const commands: string[] = [];
		const numCommands = await this.readFile.readUInt32();
		for (let cmdIndex = 0; cmdIndex < numCommands; cmdIndex++) commands.push(await this.readFile.readCharEncHeadered());

		await this.writeToJSON<CommandBlock.JSONFile>({
			type: 'command block',
			commands,
		});
	}

	private async readTexturesFile() {
		await this.readSignature('textures');
		await this.readFile.skip(8); // type and sub-type
		await this.readFile.readCharEncHeadered(); // copy of filename
		const localized = await this.readFile.readUInt8() === 1;

		if (localized) {
			await this.writeToJSON<Texture.JSONFile>({
				type: 'localized texture reference',
				path: await this.readFile.readChar8Headered(),
			});
		} else {
			await this.readFile.readCharEncHeadered(); // image format
			await this.readFile.readUInt32(); // image size
			const fileName = this.path.pop()!;
			this.path.push(fileName + '.png');
			await this.writeToFile();
		}
	}

	private async readSubtitlesFile() {
		await this.readSignature('subtitle');
		await this.readFile.skip(8); // type and unknown
		await this.readFile.readCharEncHeadered(); // copy of filename
		await this.readFile.skip(4); // unknown

		const relatedSoundFile = await this.readFile.readChar8Headered();
		const subtitles: Subtitles.Subtitle[] = [];
		const numSubtitles = await this.readFile.readUInt32();
		for (let subtitleIndex = 0; subtitleIndex < numSubtitles; subtitleIndex++) {
			const subtitle: Subtitles.Subtitle = {
				start: await this.readFile.readFloat(),
				end: await this.readFile.readFloat(),
			};

			const text = await this.readFile.readChar16Headered();
			if (text.length > 0) subtitle.text = text;

			subtitles.push(subtitle);
		}

		await this.writeToJSON<Subtitles.JSONFile>({
			type: 'subtitles',
			relatedSoundFile,
			subtitles,
		});
	}

	private async readLabelsFile() {
		await this.readSignature('labels');
		await this.readFile.skip(8); // type and unknown
		await this.readFile.readCharEncHeadered(); // copy of filename
		await this.readFile.skip(4); // unknown

		let numLabels = await this.readFile.readUInt32();
		const numGroups = await this.readFile.readUInt32();

		const labels = await this.readLabels(numLabels);
		const groups: Labels.Group[] = [];
		for (let groupIndex = 0; groupIndex < numGroups; groupIndex++) {
			const name = await this.readFile.readChar8Headered();
			numLabels = await this.readFile.readUInt32();
			await this.readFile.skip(4); // unknown

			groups.push({
				name,
				labels: await this.readLabels(numLabels),
			});
		}

		await this.writeToJSON<Labels.JSONFile>({
			type: 'labels',
			labels,
			groups,
		});
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
			.catch(() => { throw `No read permissions for "${sourcePath}".` });

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
		for (const dirInfo of index.dirs) {
			this.path.push(dirInfo.name);
			yield* this.files(dirInfo.index);
			this.path.pop();
		}

		for (const fileInfo of index.files) {
			this.path.push(fileInfo.name);
			yield fileInfo;
			this.path.pop();
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

	private async writeToFile() {
		await this.mkdirIfDoesNotExist(true);

		const writeFile = await WriteFile.open(this.destinationPath);
		try {
			await this.readFile.transfer(writeFile);
		} finally {
			await writeFile.close();
		}
	}

	private async writeToJSON<T extends object>(object: T) {
		await this.mkdirIfDoesNotExist(true);
		await fsP.writeFile(this.destinationPath + '.json', JSON.stringify(object, undefined, '\t'));
	}
}
