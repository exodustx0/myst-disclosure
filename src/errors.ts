// @typescript-eslint/indent is known to be iffy with type definitions
/* eslint-disable @typescript-eslint/indent */
import type { Primitive } from 'type-fest';

const messages = {
	DESTINATION_INVALID: 'Destination must be a directory.',
	FILE_CORRUPTED_OR_INVALID: '"{path}" is either corrupted or an invalid {type} file.',
	FILE_UNEXPECTED_EXTENSION: 'Expected "{path}" to have .{extension} extension.',
	JSON_INVALID: '"{path}" is not a valid {type} JSON file.',
	NO_READ_PERMISSIONS_PATH: 'No read permissions for "{path}".',
	NO_READ_PERMISSIONS_TYPE: 'No read permissions for {type} path.',
	NO_WRITE_PERMISSIONS_PATH: 'No write permissions for "{path}".',
	NO_WRITE_PERMISSIONS_TYPE: 'No write permissions for {type} path.',
	PATH_DOES_NOT_EXIST: 'The {type} path does not exist.',
	SOURCE_INVALID_REPACK: 'Source must be a -{extension} directory or a directory containing -{extension} directories.',
	SOURCE_INVALID_UNPACK: 'Source must be a .{extension} file or a directory containing .{extension} files.',
	TEMP_DIR_DELETE_FAILED: 'Temp directory "{path}" could not be deleted.',
} as const;

type Tokens<S extends string> = 
	S extends `${string}{${infer Token}}${infer Rest}`
	? Token | Tokens<Rest>
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
