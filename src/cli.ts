import chalk from 'chalk';
import { program } from 'commander';

import { ContainerUnpacker } from './container-unpacker.js';
import { ContainerRepacker } from './container-repacker.js';
import { SavegameUnpacker } from './savegame-unpacker.js';

(async () => {
	program
		.command('container')
		.description('.m4b file')
		.addCommand(ContainerUnpacker.command)
		.addCommand(ContainerRepacker.command);

	program
		.command('savegame')
		.description('.m4s file')
		.addCommand(SavegameUnpacker.command);

	await program.parseAsync();
})().catch(err => {
	if (typeof err === 'string') {
		console.error(`[${chalk.red('ERROR')}]`, err);
	} else {
		console.error(err);
	}
});
