import { format } from 'util';

import chalk from 'chalk';
import termSize from 'term-size';
import wrapAnsi from 'wrap-ansi';

let columns = 80;

const resize = () => {
	({ columns } = termSize());
	if (process.platform === 'win32') columns--;
};
resize();

process.stdout.on('resize', resize);

const logWrap = (logger: (...args: unknown[]) => void, message: string, ...params: unknown[]) => {
	logger(wrapAnsi(format(message, ...params), columns, { hard: true, trim: false }));
};

export const log      = (message: string, ...params: unknown[]) => logWrap(console.log,                              message,   ...params);
export const logError = (message: string, ...params: unknown[]) => logWrap(console.error, `[${chalk.red('ERROR')}] ${message}`, ...params);
