/*
 * DataDescriptor class (Data Descriptor)
 * takes a buffer, reads data descriptors for files
 */
var C = require('./../constants');

function DataDescriptor(buf) {
    this._offset = 0;
    this._complete = false;

    // check that it's a data descriptor file header
    if (buf.readUInt32LE(this._offset) != C.DATA_DESCRIPTOR_SIG) {
        throw new Error('not a Central Directory File Header');
    }

    // fixed length fields
    this.crc32 = buf.readUInt32LE(this._offset += 4);
    this.compressedSize = buf.readUInt32LE(this._offset += 4);
    this.uncompressedSize = buf.readUInt32LE(this._offset += 4);
    this._offset += 4;

    this.headerLength= this._offset;
}

module.exports = DataDescriptor;
