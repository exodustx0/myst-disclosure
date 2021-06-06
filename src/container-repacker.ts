import fs, { promises as fsP } from 'fs';
import os from 'os';
import path from 'path';

import del from 'del';
import uniqueString from 'unique-string';

import { ReadFile, WriteFile } from './util/file-handle.js';
import { ProgressLogger } from './util/progress-logger.js';
import { numBytesInIndex, numFilesInIndex } from './util/container-helpers.js';

import type * as Container from './types/container.js';
import type * as CommandBlock from './types/command-block.js';
import type * as Texture from './types/texture.js';
import type * as Subtitles from './types/subtitles.js';
import type * as Labels from './types/labels.js';

export interface ContainerRepackerSettings {
	verbose: boolean;
	skipLogFiles: boolean;
}

export class ContainerRepacker {
	private readonly tempDir = path.join(fs.realpathSync(os.tmpdir()), `disclosure_${uniqueString()}`);
	private readonly path: string[] = [];
	private readonly writeFiles: WriteFile[] = [];
	private readonly progressLogger?: ProgressLogger;

	constructor(
		private sourceRoot: string,
		private readonly destinationRoot: string,
		private readonly settings: ContainerRepackerSettings,
	) {
		if (this.settings.verbose) this.progressLogger = new ProgressLogger();
	}

	private get sourcePath() {
		return path.join(this.sourceRoot, ...this.path);
	}

	private get destinationPath() {
		return path.join(this.destinationRoot, ...this.path).replace(/-m4b/g, '.m4b');
	}

	private get currentContainerPath() {
		let currentContainerPath = this.path[this.path.length - 1];
		for (let i = this.path.length - 2; i >= 0; i--) {
			const segment = this.path[i];
			if (segment.endsWith('-m4b')) break;
			currentContainerPath = path.join(segment, currentContainerPath);
		}

		return currentContainerPath.replace('-m4b', '.m4b');
	}

	private get tempFilePath() {
		return path.join(this.tempDir, uniqueString());
	}

	private get writeFile() {
		return this.writeFiles[this.writeFiles.length - 1];
	}

	async run() {
		const interruptHandler = () => {
			del(this.tempDir, { force: true })
				.catch(() => { throw `Temp directory "${this.tempDir}" could not be deleted.` });
		};
		process.once('SIGINT', interruptHandler);

		if (this.settings.verbose) console.time('Duration');

		await fsP.mkdir(this.tempDir);

		const sourceEntry = await fsP.stat(this.sourcePath);

		if (!sourceEntry.isDirectory()) throw 'Source must be an unpacked container or a directory containing unpacked containers.';

		try {
			if (this.sourceRoot.endsWith('-m4b')) {
				this.path.push(path.parse(this.sourceRoot).base);
				this.sourceRoot = path.parse(this.sourceRoot).dir;
				await this.createWriteFile(this.destinationPath, async () => {
					await this.packContainer();
				});
			} else {
				await this.checkDir(true);
			}
		} finally {
			process.removeListener('SIGINT', interruptHandler);
			interruptHandler();
		}

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	private async checkDir(root = false) {
		const dir = (await fsP.readdir(this.sourcePath, { withFileTypes: true }))
			.filter(entry => entry.isDirectory());

		if (root && !dir.some(entry => entry.name.endsWith('-m4b'))) throw 'No unpacked containers in source directory.';

		for (const entry of dir) {
			this.path.push(entry.name);

			if (entry.name.endsWith('-m4b')) {
				if (!root) {
					const destinationDir = path.parse(this.destinationPath).dir;
					await fsP.access(destinationDir).catch(async () => {
						await fsP.mkdir(destinationDir, { recursive: true });
					});
				}
				await this.createWriteFile(this.destinationPath, async () => {
					await this.packContainer();
				});
			} else {
				await this.checkDir();
			}

			this.path.pop();
		}
	}

	/////////////
	// CONTAINER

	private async packContainer() {
		await this.writeFile.writeChar8Headered('UBI_BF_SIG\0');
		await this.writeFile.writeUInt32(0x1); // unknown
		await this.writeFile.writeUInt32(0x0); // unknown
		
		const index = await this.readIndex();

		if (this.settings.verbose) this.progressLogger!.levelUp(numFilesInIndex(index) * 3, this.currentContainerPath);
		
		await this.prepareFiles(index);
		await this.writeIndexToContainer(index, 23 + numBytesInIndex(index));
		await this.writeFilesToContainer(index);
	}

	private async readIndex() {
		const index: Container.Index = {
			dirs: [],
			files: [],
		};

		const dir = (await fsP.readdir(this.sourcePath, { withFileTypes: true }))
			.filter(entry => entry.isDirectory() || entry.isFile());

		for (const entry of dir) {
			if (entry.isDirectory() && !entry.name.endsWith('-m4b')) {
				this.path.push(entry.name);
				index.dirs.push({
					name: entry.name,
					index: await this.readIndex(),
				});
				this.path.pop();
			} else {
				if (entry.name.endsWith('.log') && this.settings.skipLogFiles) continue;

				index.files.push({
					name: entry.name,
					size: 0,
					offset: 0,
				});
			}
		}

		return index;
	}

	private async prepareFiles(index: Container.Index) {
		for (const fileInfo of this.files(index)) {
			if (fileInfo.name.endsWith('-m4b')) {
				fileInfo.tempPath = this.tempFilePath;
				fileInfo.name = fileInfo.name.slice(0, -4) + '.m4b';
				await this.createWriteFile(fileInfo.tempPath, async () => {
					await this.packContainer();
					fileInfo.size = this.writeFile.bytesWritten;
				});
			} else if (this.inBranchOfDirectory(/^command_?blocks?$/)) {
				await this.writeCommandBlockFile(fileInfo);
			} else if (this.inBranchOfDirectory('textures')) {
				await this.writeTexturesFile(fileInfo);
			} else if (this.inBranchOfDirectory('subtitle')) {
				await this.writeSubtitlesFile(fileInfo);
			} else if (this.inBranchOfDirectory('text')) {
				await this.writeLabelsFile(fileInfo);
			} else {
				fileInfo.size = (await fsP.stat(this.sourcePath)).size;
			}

			if (this.settings.verbose) this.progressLogger!.tick();
		}
	}

	private async writeIndexToContainer(index: Container.Index, offset: number) {
		await this.writeFile.writeUInt8(index.dirs.length);
		for (const dirInfo of index.dirs) {
			await this.writeFile.writeChar8Headered(dirInfo.name + '\0');
			offset = await this.writeIndexToContainer(dirInfo.index, offset);
		}

		await this.writeFile.writeUInt32(index.files.length);
		for (const fileInfo of index.files) {
			await this.writeFile.writeChar8Headered(fileInfo.name + '\0');
			await this.writeFile.writeUInt32(fileInfo.size);
			await this.writeFile.writeUInt32(offset);
			offset += fileInfo.size;

			if (this.settings.verbose) this.progressLogger!.tick();
		}

		return offset;
	}

	private async writeFilesToContainer(index: Container.Index) {
		for (const fileInfo of this.files(index)) {
			const readFile = await ReadFile.open(fileInfo.tempPath ?? this.sourcePath);
			try {
				await readFile.transfer(this.writeFile);
			} finally {
				await readFile.close();
			}
			if (typeof fileInfo.tempPath === 'string') await del(fileInfo.tempPath, { force: true });
			
			if (this.settings.verbose) this.progressLogger!.tick();
		}
	}

	////////////////
	// FILE WRITERS

	private async writeSignature() {
		await this.writeFile.writeChar8('ubi/b0-l');
	}

	private async writeCommandBlockFile(fileInfo: Container.FileInfo) {
		const json = await this.readFromJSON<CommandBlock.JSONFile>();
		if (
			(json.type as string) !== 'command block' ||
			!Array.isArray(json.commands)
		) throw `"${this.sourcePath}" is not a valid command block JSON file.`;

		fileInfo.name = fileInfo.name.slice(0, -5);
		fileInfo.tempPath = this.tempFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x6); // type
			await this.writeFile.writeUInt32(0x1); // sub-type
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4));
			await this.writeFile.writeUInt32(json.commands.length);
			for (const command of json.commands) await this.writeFile.writeCharEncHeadered(command);
	
			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeTexturesFile(fileInfo: Container.FileInfo) {
		if (!fileInfo.name.includes('.bin')) {
			fileInfo.size = (await fsP.stat(this.sourcePath)).size;
			return;
		}

		fileInfo.tempPath = this.tempFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x27); // type
			await this.writeFile.writeUInt32(0x2); // unknown
			if (fileInfo.name.endsWith('.png')) {
				await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -8));
				fileInfo.name = fileInfo.name.slice(0, -4);
				await this.writeFile.writeUInt8(0x0); // not localized
				await this.writeFile.writeCharEncHeadered('png'); // image format
				await this.writeFile.writeUInt32((await fsP.stat(this.sourcePath)).size); // image size
	
				const png = await ReadFile.open(this.sourcePath);
				try {
					await png.transfer(this.writeFile);
				} finally {
					await png.close();
				}
			} else {
				const json = await this.readFromJSON<Texture.JSONFile>();
				if (
					(json.type as string) !== 'localized texture reference' ||
					typeof json.path !== 'string'
				) throw `"${this.sourcePath}" is not a valid localized texture reference JSON file.`;
	
				fileInfo.name = fileInfo.name.slice(0, -5);
				await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4));
				await this.writeFile.writeUInt8(0x1); // localized
				await this.writeFile.writeChar8Headered(json.path);
			}
	
			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeSubtitlesFile(fileInfo: Container.FileInfo) {
		const json = await this.readFromJSON<Subtitles.JSONFile>();
		if (
			(json.type as string) !== 'subtitles' ||
			typeof json.relatedSoundFile !== 'string' ||
			!Array.isArray(json.subtitles)
		) throw `"${this.sourcePath}" is not a valid subtitles JSON file.`;

		fileInfo.name = fileInfo.name.slice(0, -5);
		fileInfo.tempPath = this.tempFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x24); // type
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4));
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeChar8Headered(json.relatedSoundFile);
			await this.writeFile.writeUInt32(json.subtitles.length);
			for (const subtitle of json.subtitles) {
				await this.writeFile.writeFloat(subtitle.start);
				await this.writeFile.writeFloat(subtitle.end);
				await this.writeFile.writeChar16Headered(subtitle.text ?? '');
			}
			
			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeLabelsFile(fileInfo: Container.FileInfo) {
		const json = await this.readFromJSON<Labels.JSONFile>();
		if (
			(json.type as string) !== 'labels' ||
			!Array.isArray(json.labels) ||
			!Array.isArray(json.groups)
		) throw `"${this.sourcePath}" is not a valid labels JSON file.`;

		fileInfo.name = fileInfo.name.slice(0, -5);
		fileInfo.tempPath = this.tempFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x25); // type
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4));
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeUInt32(json.labels.length);
			await this.writeFile.writeUInt32(json.groups.length);
			await this.writeLabels(json.labels);
			for (const group of json.groups) {
				await this.writeFile.writeChar8Headered(group.name);
				await this.writeFile.writeUInt32(group.labels.length);
				await this.writeFile.writeUInt32(0x0); // unknown
				await this.writeLabels(group.labels);
			}
			
			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeLabels(labels: Labels.Label[]) {
		for (const label of labels) {
			await this.writeFile.writeChar8Headered(label.name);
			await this.writeFile.writeChar16Headered(label.text);
		}
	}

	///////////
	// UTILITY

	private async createWriteFile(destinationPath: string, action: () => Promise<void>) {
		const destinationDir = path.parse(destinationPath).dir;
		
		await fsP.access(destinationDir, fs.constants.R_OK)
			.catch(() => {
				throw `No write permissions for "${destinationDir}".`;
			});
		
		this.writeFiles.push(await WriteFile.open(destinationPath));

		try {
			await action();
		} finally {
			await this.writeFiles.pop()!.close();
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

	private async readFromJSON<T extends object>() {
		if (!this.sourcePath.endsWith('.json')) throw `Unexpected file "${this.sourcePath}".`;
		return JSON.parse(await fsP.readFile(this.sourcePath, 'utf8')) as T;
	}
}
