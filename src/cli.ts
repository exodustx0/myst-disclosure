import chalk from 'chalk';
import { program } from 'commander';

import { ContainerUnpacker } from './container-unpacker.js';
import { ContainerRepacker } from './container-repacker.js';

(async () => {
	program
		.command('container')
		.description('container format (.m4b files)')
		.addCommand(ContainerUnpacker.command)
		.addCommand(ContainerRepacker.command);

	// TODO: add savefile and options un-/repackers

	await program.parseAsync();
})().catch(err => {
	if (typeof err === 'string') {
		console.error(`[${chalk.red('ERROR')}]`, err);
	} else {
		console.error(err);
	}
});
