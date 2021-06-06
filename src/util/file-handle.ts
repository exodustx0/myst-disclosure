import { promises as fsP } from 'fs';
import type { PathLike } from 'fs';

const scrambleBits = (bytes: Buffer) => {
	for (const [i, byte] of bytes.entries()) {
		bytes[i] = (byte >> 1 ^ byte << 1) & 0x55 ^ byte << 1;
	}

	return bytes;
};

export class ReadFile {
	private internalFileOffset: number;
	private closed = false;

	private constructor(
		private readonly fileHandle: fsP.FileHandle,
		private readonly startOffset: number,
		private readonly endOffset: number,
	) {
		this.internalFileOffset = this.startOffset;
	}

	get bytesRead() {
		return this.internalFileOffset;
	}

	static async open(path: PathLike, startOffset?: number, endOffset?: number) {
		const fileHandle = await fsP.open(path, 'r');
		return new this(fileHandle, startOffset ?? 0, endOffset ?? (await fileHandle.stat()).size);
	}

	async close() {
		if (!this.closed) {
			this.closed = true;
			await this.fileHandle.close();
		}
	}

	async transfer(writeFile: WriteFile, numBytes?: number) {
		const endOffset = typeof numBytes === 'number'
			? this.internalFileOffset + numBytes
			: this.endOffset;

		while (this.internalFileOffset < endOffset) {
			const chunkSize = Math.min(0x4000, endOffset - this.internalFileOffset);
			const chunk = await this.readBuffer(chunkSize);
			await writeFile.writeBuffer(chunk);
		}

		if (typeof numBytes !== 'number') await this.close();
	}

	async skip(numBytes: number) {
		while (numBytes > 0) {
			const skipBytes = Math.min(numBytes, 0x4000);
			numBytes -= skipBytes;
			await this.readBuffer(skipBytes);
		}
	}

	////////////////
	// READ METHODS

	async readBuffer(numBytes: number) {
		if (this.closed) throw new Error('Read after file closed.');
		if (numBytes === 0) return Buffer.from([]);
		if (this.internalFileOffset + numBytes > this.endOffset) throw new Error('Read out of bounds.');

		const buffer = Buffer.allocUnsafe(numBytes);
		await this.fileHandle.read(buffer, 0, numBytes, this.internalFileOffset);
		this.internalFileOffset += numBytes;
		return buffer;
	}

	async readBool() {
		const byte = await this.readBuffer(1);
		return byte[0] !== 0;
	}

	async readUInt8() {
		const byte = await this.readBuffer(1);
		return byte.readUInt8();
	}
	async readInt8() {
		const byte = await this.readBuffer(1);
		return byte.readInt8();
	}

	async readUInt16() {
		const bytes = await this.readBuffer(2);
		return bytes.readUInt16LE();
	}
	async readInt16() {
		const bytes = await this.readBuffer(2);
		return bytes.readInt16LE();
	}

	async readUInt32() {
		const bytes = await this.readBuffer(4);
		return bytes.readUInt32LE();
	}
	async readInt32() {
		const bytes = await this.readBuffer(4);
		return bytes.readInt32LE();
	}

	async readFloat() {
		const bytes = await this.readBuffer(4);
		return bytes.readFloatLE();
	}

	async readChar8(length: number) {
		if (length === 0) return '';
		const bytes = await this.readBuffer(length);
		return bytes.toString();
	}
	async readChar8Headered() {
		const length = await this.readUInt32();
		return this.readChar8(length);
	}

	async readChar16(length: number) {
		if (length === 0) return '';
		const bytes = await this.readBuffer(length * 2);
		return bytes.toString('utf16le');
	}
	async readChar16Headered() {
		const length = await this.readUInt32();
		return this.readChar16(length);
	}

	async readCharEnc(length: number) {
		if (length === 0) return '';
		const bytes = await this.readBuffer(length);
		scrambleBits(bytes);
		return bytes.toString();
	}
	async readCharEncHeadered() {
		const length = await this.readUInt32();
		return this.readCharEnc(length);
	}
}

export class WriteFile {
	private internalFileOffset = 0;
	private internalFileSum = 0;
	private closed = false;

	private constructor(
		private readonly fileHandle: fsP.FileHandle,
	) {}

	get bytesWritten() {
		return this.internalFileOffset;
	}

	get fileSum() {
		return this.internalFileSum;
	}

	static async open(path: PathLike) {
		try {
			const fileHandle = await fsP.open(path, 'w');
			return new this(fileHandle);
		} catch (err: unknown) {
			if (err instanceof Error) Error.captureStackTrace(err, this.open);
			throw err;
		}
	}

	async close() {
		this.closed = true;
		await this.fileHandle.close();
	}

	/////////////////
	// WRITE METHODS

	async writeBuffer(buffer: Buffer) {
		if (this.closed) throw new Error('Write after file closed.');
		if (buffer.length === 0) return;

		await this.fileHandle.write(buffer);
		for (const byte of buffer) this.internalFileSum += byte;
		this.internalFileOffset += buffer.length;
	}

	async writeBool(value: boolean) {
		await this.writeUInt8(value ? 1 : 0);
	}

	async writeUInt8(value: number) {
		const buffer = Buffer.allocUnsafe(1);
		buffer.writeUInt8(value & 0xFF);
		await this.writeBuffer(buffer);
	}
	async writeInt8(value: number) {
		const buffer = Buffer.allocUnsafe(1);
		buffer.writeInt8(value & 0xFF);
		await this.writeBuffer(buffer);
	}

	async writeUInt16(value: number) {
		const buffer = Buffer.allocUnsafe(2);
		buffer.writeUInt16LE(value & 0xFFFF);
		await this.writeBuffer(buffer);
	}
	async writeInt16(value: number) {
		const buffer = Buffer.allocUnsafe(2);
		buffer.writeInt16LE(value & 0xFFFF);
		await this.writeBuffer(buffer);
	}

	async writeUInt32(value: number) {
		const buffer = Buffer.allocUnsafe(4);
		buffer.writeUInt32LE(value & 0xFFFFFFFF);
		await this.writeBuffer(buffer);
	}
	async writeInt32(value: number) {
		const buffer = Buffer.allocUnsafe(4);
		buffer.writeInt32LE(value & 0xFFFFFFFF);
		await this.writeBuffer(buffer);
	}

	async writeFloat(value: number) {
		const buffer = Buffer.allocUnsafe(4);
		buffer.writeFloatLE(value);
		await this.writeBuffer(buffer);
	}

	async writeChar8(value: string) {
		if (value.length === 0) return;
		await this.writeBuffer(Buffer.from(value));
	}
	async writeChar8Headered(value: string) {
		await this.writeUInt32(value.length);
		await this.writeChar8(value);
	}

	async writeChar16(value: string) {
		if (value.length === 0) return;
		await this.writeBuffer(Buffer.from(value, 'utf16le'));
	}
	async writeChar16Headered(value: string) {
		await this.writeUInt32(value.length);
		await this.writeChar16(value);
	}

	async writeCharEnc(value: string) {
		if (value.length === 0) return;
		await this.writeBuffer(scrambleBits(Buffer.from(value)));
	}
	async writeCharEncHeadered(value: string) {
		await this.writeUInt32(value.length);
		await this.writeCharEnc(value);
	}
}
