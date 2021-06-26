// @typescript-eslint/indent is known to be iffy with type definitions
/* eslint-disable @typescript-eslint/indent */
import type { Primitive } from 'type-fest';

import { messages } from './messages.js';

type NumArgs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
type ReplacementTokens<S extends string, N extends number = 1> =
	string extends S
	? string[]
	: S extends `${string}$${N}${string}`
	? N extends 20 ? [Primitive] : [Primitive, ...ReplacementTokens<S, NumArgs[N]>]
	: [];

export class CustomError extends Error {}
export class NonFatalError<MSG extends keyof typeof messages> extends CustomError {
	constructor(messageKey: MSG, ...replacementTokens: ReplacementTokens<typeof messages[MSG]>) {
		let message = messages[messageKey] as string;
		for (const [i, replacement] of replacementTokens.entries()) {
			if (message.includes(`$${i + 1}`)) message = message.replace(new RegExp(`\\$${i + 1}`, 'g'), String(replacement));
		}

		super(message);
	}
}
export class AnomalyError extends CustomError {
	constructor(readonly anomaly: string) {
		super('Anomaly detected.');
	}
}
