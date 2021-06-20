export const messages = {
	DESTINATION_INVALID: 'Destination must be a directory.' as const,
	FILE_CORRUPTED_OR_INVALID: '"$1" is either corrupted or an invalid $2 file.' as const,
	FILE_UNEXPECTED_EXTENSION: 'Expected "$1" to have $2 extension.' as const,
	JSON_INVALID: '"$1" is not a valid $2 JSON file.' as const,
	NO_READ_PERMISSIONS_PATH: 'No read permissions for "$1".' as const,
	NO_READ_PERMISSIONS_TYPE: 'No read permissions for $1 path.' as const,
	NO_WRITE_PERMISSIONS_PATH: 'No write permissions for "$1".' as const,
	NO_WRITE_PERMISSIONS_TYPE: 'No write permissions for $1 path.' as const,
	PATH_DOES_NOT_EXIST: 'The $1 path does not exist.' as const,
	SOURCE_INVALID_REPACK: 'Source must be a -$1 directory or a directory containing -$1 directories.' as const,
	SOURCE_INVALID_UNPACK: 'Source must be a .$1 file or a directory containing .$1 files.' as const,
	TEMP_DIR_DELETE_FAILED: 'Temp directory "$1" could not be deleted.' as const,
};
