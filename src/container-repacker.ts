import fs, { promises as fsP } from 'fs';
import path from 'path';

import { Command } from 'commander';
import del from 'del';

import { NonFatalError, AnomalyError } from './errors.js';

import { pathManager } from './managers/path-manager.js';
import { tempManager } from './managers/temp-manager.js';

import { numBytesInIndex, numFilesInIndex } from './util/container-helpers.js';
import { ReadFile, WriteFile } from './util/file-handle.js';
import { ProgressLogger } from './util/progress-logger.js';

import type * as Container from './types/container.js';
import type * as CommandBlock from './types/command-block.js';
import type * as Texture from './types/texture.js';
import type * as Subtitles from './types/subtitles.js';
import type * as Labels from './types/labels.js';

interface Settings {
	verbose: boolean;
	skipLogFiles: boolean;
}

export class ContainerRepacker {
	static command = new Command()
		.command('repack <source> [destination]')
		.description('repack one or more unpacked containers (directory ending with "-m4b")')
		.option('-v, --verbose', 'verbose output')
		.option('-L, --skip-log-files', 'skip repacking of .log files')
		.action(async (source: string, destination?: string) => {
			await pathManager.init('m4b', 'repack', source, destination);

			const packer = new ContainerRepacker(ContainerRepacker.command.opts() as Settings);
			await packer.run();
		});

	private readonly writeFiles: WriteFile[] = [];
	private readonly progressLogger?: ProgressLogger;

	private constructor(
		private readonly settings: Settings,
	) {
		if (this.settings.verbose) this.progressLogger = new ProgressLogger();
	}

	private get writeFile() {
		return this.writeFiles[this.writeFiles.length - 1];
	}

	private async run() {
		if (this.settings.verbose) console.time('Duration');

		await pathManager.forEachSourceFile(async () => {
			await this.createWriteFile(pathManager.destination, async () => {
				await this.packContainer();
			});
		});

		if (this.settings.verbose) console.timeEnd('Duration');
	}

	/////////////
	// CONTAINER

	private async packContainer() {
		await this.writeFile.writeChar8Headered('UBI_BF_SIG\0');
		await this.writeFile.writeUInt32(0x1); // unknown
		await this.writeFile.writeUInt32(0x0); // unknown

		const index = await this.readIndex();

		if (this.settings.verbose) this.progressLogger!.levelUp(numFilesInIndex(index) * 3, pathManager.currentDeepestItemPath);

		await this.prepareFiles(index);
		await this.writeIndexToContainer(index, 23 + numBytesInIndex(index));
		await this.writeFilesToContainer(index);
	}

	private async readIndex() {
		const dir = (await fsP.readdir(pathManager.source, { withFileTypes: true }))
			.filter(entry => entry.isDirectory() || entry.isFile());

		const subDirs: Container.DirInfo[] = [];
		const files: Container.FileInfo[] = [];
		for (const entry of dir) {
			if (entry.isDirectory() && !entry.name.endsWith('-m4b')) {
				pathManager.pushSegment(entry.name);

				const index = await this.readIndex();
				if (!index.dirs && !index.files) throw new AnomalyError('Empty directory');

				subDirs.push({
					name: entry.name,
					index,
				});

				pathManager.popSegment();
			} else if (entry.isFile() || (entry.isDirectory() && entry.name.endsWith('-m4b'))) {
				if (entry.name.endsWith('.log') && this.settings.skipLogFiles) continue;

				files.push({
					name: entry.name,
					size: 0,
					offset: 0,
				});
			}
		}

		const index: Container.Index = {};

		if (subDirs.length > 0) index.dirs = subDirs;
		if (files.length > 0) index.files = files;

		return index;
	}

	private async prepareFiles(index: Container.Index) {
		for (const fileInfo of this.files(index)) {
			if (fileInfo.name.endsWith('-m4b')) {
				fileInfo.name = fileInfo.name.slice(0, -4) + '.m4b';
				fileInfo.tempPath = tempManager.newFilePath;
				await this.createWriteFile(fileInfo.tempPath, async () => {
					await this.packContainer();
					fileInfo.size = this.writeFile.bytesWritten;
				});
			} else if (pathManager.inBranchOfDirectory(/^command_?blocks?$/)) {
				await this.writeCommandBlockFile(fileInfo);
			} else if (pathManager.inBranchOfDirectory('textures')) {
				await this.writeTexturesFile(fileInfo);
			} else if (pathManager.inBranchOfDirectory('subtitle')) {
				await this.writeSubtitlesFile(fileInfo);
			} else if (pathManager.inBranchOfDirectory('text')) {
				await this.writeLabelsFile(fileInfo);
			} else {
				fileInfo.size = (await fsP.stat(pathManager.source)).size;
			}

			if (this.settings.verbose) this.progressLogger!.tick();
		}
	}

	private async writeIndexToContainer(index: Container.Index, offset: number) {
		if (index.dirs) {
			await this.writeFile.writeUInt8(index.dirs.length);
			for (const dirInfo of index.dirs) {
				await this.writeFile.writeChar8Headered(dirInfo.name + '\0');
				offset = await this.writeIndexToContainer(dirInfo.index, offset);
			}
		} else {
			await this.writeFile.writeUInt8(0);
		}

		if (index.files) {
			await this.writeFile.writeUInt32(index.files.length);
			for (const fileInfo of index.files) {
				await this.writeFile.writeChar8Headered(fileInfo.name + '\0');
				await this.writeFile.writeUInt32(fileInfo.size);
				await this.writeFile.writeUInt32(offset);
				offset += fileInfo.size;

				if (this.settings.verbose) this.progressLogger!.tick();
			}
		} else {
			await this.writeFile.writeUInt32(0);
		}

		return offset;
	}

	private async writeFilesToContainer(index: Container.Index) {
		for (const fileInfo of this.files(index)) {
			const readFile = await ReadFile.open(fileInfo.tempPath ?? pathManager.source);
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
		) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'command block' });

		fileInfo.name = fileInfo.name.slice(0, -5); // '.json'
		fileInfo.tempPath = tempManager.newFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x6); // type
			await this.writeFile.writeUInt32(0x1); // sub-type
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4)); // '.bin'
			await this.writeFile.writeUInt32(json.commands.length);
			for (const command of json.commands) await this.writeFile.writeCharEncHeadered(command);

			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeTexturesFile(fileInfo: Container.FileInfo) {
		if (!fileInfo.name.includes('.bin')) {
			fileInfo.size = (await fsP.stat(pathManager.source)).size;
			return;
		}

		fileInfo.tempPath = tempManager.newFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x27); // type
			await this.writeFile.writeUInt32(0x2); // unknown
			if (fileInfo.name.endsWith('.png')) {
				fileInfo.name = fileInfo.name.slice(0, -4); // '.png'
				await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4)); // '.bin'
				await this.writeFile.writeUInt8(0x0); // not localized
				await this.writeFile.writeCharEncHeadered('png'); // image format

				const png = await ReadFile.open(pathManager.source);
				if (!await png.equals([0x89, 0x50, 0x4E, 0x47])) throw new NonFatalError('FILE_CORRUPTED_OR_INVALID', { path: pathManager.pathString, type: 'PNG' });

				await this.writeFile.writeUInt32(png.totalSize);
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
				) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'localized texture reference' });
				// TODO: check if `json.path` exists in filesystem, otherwise throw AnomalyError

				fileInfo.name = fileInfo.name.slice(0, -5); // '.json'
				await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4)); // '.bin'
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
			typeof json.sceneLength !== 'number' ||
			!Array.isArray(json.subtitles)
		) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'subtitles' });
		if (json.relatedSoundFile.length === 0) throw new AnomalyError('Missing related sound file');
		if (json.subtitles.length === 0) throw new AnomalyError('No subtitles');
		if (json.subtitles[json.subtitles.length - 1].start > json.sceneLength) throw new AnomalyError('Scene length doesn\'t contain all subtitles');

		fileInfo.name = fileInfo.name.slice(0, -5); // '.json'
		fileInfo.tempPath = tempManager.newFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x24); // type
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4)); // '.bin'
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeChar8Headered(json.relatedSoundFile);
			await this.writeFile.writeUInt32(json.subtitles.length);

			json.subtitles.push({ start: json.sceneLength });
			let a = json.subtitles[0];
			for (let subtitleIndex = 1; subtitleIndex < json.subtitles.length; subtitleIndex++) {
				if (
					typeof a.start !== 'number' ||
					(a.text !== undefined && typeof a.text !== 'string')
				) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'subtitles' });
				const b = json.subtitles[subtitleIndex];
				await this.writeFile.writeFloat(a.start);
				await this.writeFile.writeFloat(b.start);
				await this.writeFile.writeChar16Headered(a.text ?? '');
				a = b;
			}

			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeLabelsFile(fileInfo: Container.FileInfo) {
		const json = await this.readFromJSON<Labels.JSONFile>();
		if (
			(json.type as string) !== 'labels' ||
			(json.labels !== undefined && !Array.isArray(json.labels)) ||
			(json.groups !== undefined && !Array.isArray(json.groups))
		) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'labels' });
		if (
			(!Array.isArray(json.labels) || json.labels.length === 0) &&
			(!Array.isArray(json.groups) || json.groups.length === 0)
		) throw new AnomalyError('No labels');

		fileInfo.name = fileInfo.name.slice(0, -5); // '.json'
		fileInfo.tempPath = tempManager.newFilePath;
		await this.createWriteFile(fileInfo.tempPath, async () => {
			await this.writeSignature();
			await this.writeFile.writeUInt32(0x25); // type
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeCharEncHeadered(fileInfo.name.slice(0, -4)); // '.bin'
			await this.writeFile.writeUInt32(0x1); // unknown
			await this.writeFile.writeUInt32(json.labels?.length ?? 0);
			await this.writeFile.writeUInt32(json.groups?.length ?? 0);
			if (json.labels) await this.writeLabels(json.labels);
			if (json.groups) {
				for (const group of json.groups) {
					if (typeof group.name !== 'string' || !Array.isArray(group.labels)) throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'labels' });
					await this.writeFile.writeChar8Headered(group.name);
					await this.writeFile.writeUInt32(group.labels.length);
					await this.writeFile.writeUInt32(0x0); // unknown
					await this.writeLabels(group.labels);
				}
			}

			fileInfo.size = this.writeFile.bytesWritten;
		});
	}

	private async writeLabels(labels: Labels.Label[]) {
		for (const label of labels) {
			if (typeof label.name !== 'string' || typeof label.text !== 'string') throw new NonFatalError('JSON_INVALID', { path: pathManager.pathString, type: 'labels' });
			await this.writeFile.writeChar8Headered(label.name);
			await this.writeFile.writeChar16Headered(label.text);
		}
	}

	///////////
	// UTILITY

	private async createWriteFile(destinationPath: string, action: () => Promise<void>) {
		const destinationDir = path.parse(destinationPath).dir;

		await fsP.access(destinationDir, fs.constants.R_OK)
			.catch(() => { throw new NonFatalError('NO_WRITE_PERMISSIONS_PATH', { path: destinationDir }) });

		this.writeFiles.push(await WriteFile.open(destinationPath));

		try {
			await action();
		} finally {
			await this.writeFiles.pop()!.close();
		}
	}

	private *files(index: Container.Index): Generator<Container.FileInfo> {
		if (index.dirs) {
			for (const dirInfo of index.dirs) {
				pathManager.pushSegment(dirInfo.name);
				yield* this.files(dirInfo.index);
				pathManager.popSegment();
			}
		}

		if (index.files) {
			for (const fileInfo of index.files) {
				pathManager.pushSegment(fileInfo.name);
				yield fileInfo;
				pathManager.popSegment();
			}
		}
	}

	private async readFromJSON<T extends object>() {
		if (!pathManager.currentSegment.endsWith('.json')) throw new NonFatalError('FILE_UNEXPECTED_EXTENSION', { path: pathManager.pathString, extension: 'json' });
		return JSON.parse(await fsP.readFile(pathManager.source, 'utf8')) as T;
	}
}
