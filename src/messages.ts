export const messages = {
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
