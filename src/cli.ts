import cliCursor from 'cli-cursor';
import { program } from 'commander';

import { ContainerUnpacker } from './container-unpacker.js';
import { ContainerRepacker } from './container-repacker.js';
import { SavegameUnpacker } from './savegame-unpacker.js';

import { errorLog } from './util/wrapped-log.js';

cliCursor.hide(process.stdout);

program
	.command('container')
	.description('.m4b file')
	.addHelpCommand(false)
	.addCommand(ContainerUnpacker.command)
	.addCommand(ContainerRepacker.command);

program
	.command('savegame')
	.description('.m4s file')
	.addHelpCommand(false)
	.addCommand(SavegameUnpacker.command);

program
	.addHelpCommand(false)
	.parseAsync()
	.catch(err => {
		if (typeof err === 'string') {
			errorLog(err);
		} else {
			console.error(err);
		}
	});
