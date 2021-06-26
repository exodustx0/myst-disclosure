// @typescript-eslint/indent is known to be iffy with type definitions
/* eslint-disable @typescript-eslint/indent */
import type { Primitive } from 'type-fest';

import { messages } from './messages.js';

type Tokens<S extends string> = 
	S extends `${string}{${infer Key}}${infer Rest}`
	? Key | Tokens<Rest>
	: never;

type ReplacementObject<S extends string> =
	string extends S
	? string[]
	: S extends `${string}{${string}}${string}`
	? [replacementObject: Record<Tokens<S>, Primitive>]
	: [replacementObject?: Record<string, never>];

export class CustomError extends Error {}
export class NonFatalError<MSG extends keyof typeof messages> extends CustomError {
	constructor(messageKey: MSG, ...[replacementObject]: ReplacementObject<typeof messages[MSG]>) {
		let message = messages[messageKey] as string;
		while (true) {
			const tokenMatch = /{([a-z\d]+)}/i.exec(message);
			if (!tokenMatch) break;

			const [token, key] = tokenMatch;
			message = message.replace(token, replacementObject![key as keyof typeof replacementObject]);
		}

		super(message);
	}
}
export class AnomalyError extends CustomError {
	constructor(readonly anomaly: string) {
		super('Anomaly detected.');
	}
}
