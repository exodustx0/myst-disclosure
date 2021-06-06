import fs, { promises as fsP } from 'fs';
import path from 'path';

import chalk from 'chalk';
import { program } from 'commander';

import { ContainerUnpacker } from './container-unpacker.js';
import type { ContainerUnpackerSettings } from './container-unpacker.js';
import { ContainerPacker } from './container-packer.js';
import type { ContainerPackerSettings } from './container-packer.js';

const checkPathArg = async (pathArg: string, type: string) => {
	await fsP.access(pathArg, fs.constants.F_OK).catch(() => {
		throw `The ${type} path does not exist.`;
	});
	await fsP.access(pathArg, fs.constants.R_OK).catch(() => {
		throw `The ${type} path cannot be read from.`;
	});
};

(async () => {
	const unpack = program
		.command('unpack <source> [destination]')
		.description('unpack a container or a folder of containers')
		.option('-v, --verbose', 'verbose output')
		.option('-i, --index-only', 'only unpack the index of containers')
		.option('-L, --skip-log-files', 'skip unpacking of .log files')
		.action(async (source: string, destination?: string) => {
			source = path.resolve(source);
			await checkPathArg(source, 'source');

			if (typeof destination === 'string') {
				destination = path.resolve(destination);
				await checkPathArg(destination, 'destination');
			} else {
				destination = source.endsWith('.m4b')
					? path.parse(source).dir
					: source;
			}

			const unpacker = new ContainerUnpacker(source, destination, unpack.opts() as ContainerUnpackerSettings);
			await unpacker.run();
		});
	
	const pack = program
		.command('pack <source> [destination]')
		.description('pack one or more unpacked containers (directory ending with "-m4b")')
		.option('-v, --verbose', 'verbose output')
		.option('-L, --skip-log-files', 'skip unpacking of .log files')
		.action(async (source: string, destination?: string) => {
			source = path.resolve(source);
			await checkPathArg(source, 'source');

			if (typeof destination === 'string') {
				destination = path.resolve(destination);
				await checkPathArg(destination, 'destination');
			} else {
				destination = source.endsWith('-m4b')
					? path.parse(source).dir
					: source;
			}

			const packer = new ContainerPacker(source, destination, pack.opts() as ContainerPackerSettings);
			await packer.run();
		});

	// TODO: add savefile and options (un)packers

	await program.parseAsync();
})().catch(err => {
	if (typeof err === 'string') {
		console.error(`[${chalk.red('ERROR')}]`, err);
	} else {
		console.error(err);
	}
});
