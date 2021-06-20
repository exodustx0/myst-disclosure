import type { Primitive } from 'type-fest';

import { messages } from './messages.js';

type NumArgs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
type ReplacementToken<S extends string, N extends number = 1> =
	string extends S ? ['message in messages.ts must be `as const`'] :
		S extends `${string}$${N}${string}` ? (
			N extends 20 ? [Primitive] : [Primitive, ...ReplacementToken<S, NumArgs[N]>]
		) : [];

export class CustomError extends Error {}
export class NonFatalError<MSG extends keyof typeof messages> extends CustomError {
	constructor(messageKey: MSG, ...replacementToken: ReplacementToken<typeof messages[MSG]>) {
		let message = messages[messageKey] as string;
		for (const [i, replacement] of replacementToken.entries()) {
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
