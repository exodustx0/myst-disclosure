export const messages = {
	DESTINATION_INVALID: 'Destination must be a directory.',
	FILE_CORRUPTED_OR_INVALID: '"$1" is either corrupted or an invalid $2 file.',
	FILE_UNEXPECTED_EXTENSION: 'Expected "$1" to have $2 extension.',
	JSON_INVALID: '"$1" is not a valid $2 JSON file.',
	NO_READ_PERMISSIONS_PATH: 'No read permissions for "$1".',
	NO_READ_PERMISSIONS_TYPE: 'No read permissions for $1 path.',
	NO_WRITE_PERMISSIONS_PATH: 'No write permissions for "$1".',
	NO_WRITE_PERMISSIONS_TYPE: 'No write permissions for $1 path.',
	PATH_DOES_NOT_EXIST: 'The $1 path does not exist.',
	SOURCE_INVALID_REPACK: 'Source must be a -$1 directory or a directory containing -$1 directories.',
	SOURCE_INVALID_UNPACK: 'Source must be a .$1 file or a directory containing .$1 files.',
	TEMP_DIR_DELETE_FAILED: 'Temp directory "$1" could not be deleted.',
} as const;
