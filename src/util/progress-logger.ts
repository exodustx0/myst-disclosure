import chalk from 'chalk';
import termSize from 'term-size';

const { stdout, platform } = process;

export class ProgressLogger {
	private readonly counters: number[] = [];
	private readonly totals: number[] = [];
	private columns = 0;
	private indent = 0;

	constructor() {
		this.resize();

		stdout.on('resize', () => this.resize());
	}

	private get counter() {
		return this.counters[this.counters.length - 1];
	}
	private set counter(value) {
		this.counters[this.counters.length - 1] = value;
	}

	private get total() {
		return this.totals[this.totals.length - 1];
	}

	tick() {
		this.counter++;
		stdout.moveCursor(0, -1);
		stdout.cursorTo(this.indent + 1);
		stdout.write(((this.counter / this.total) * 100).toFixed(2).padStart(6));
		stdout.cursorTo(0);

		if (this.counter < this.total) {
			stdout.moveCursor(0, 1);
			return;
		}

		this.indent -= 2;
		this.counters.pop();
		this.totals.pop();

		if (this.indent === 0) {
			stdout.write(chalk.green('✓'));
			stdout.moveCursor(-1, 1);
		} else {
			stdout.clearLine(1);
		}
	}

	levelUp(total: number, item: string) {
		this.counters.push(0);
		this.totals.push(total);
		
		if (this.indent === 0) stdout.write(chalk.cyan('-'));

		this.indent += 2;

		stdout.cursorTo(this.indent);
		// TODO: handle edge case for when there's less than X columns remaining for printing the item
		stdout.write(`[  0.00%] ${item.slice(0, this.columns - this.indent - 11)}\n`);
	}

	private resize() {
		let { columns } = termSize();
		if (platform === 'win32') columns--;
		this.columns = columns;
	}
}
