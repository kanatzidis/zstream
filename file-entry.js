/*
 * FileEntry class
 * handles extraction; puts in shape for isaacs/fstream
 */
var zlib    = require('zlib'),
    util    = require('util'),
    Stream  = require('stream').Stream,
    C       = require('./constants'),
    bl      = require('bl');

function FileEntry(header, buffer, offset) {

    var offset = offset || 0;

    this.compressedData = new bl(buffer.slice(offset, offset + header.compressedSize));
    this.compressedData.end();
    if(this.compressedData.length !== header.compressedSize) {
      this.incomplete = true;
    }
    this.header = header;

    this.path = header.filename;
    this.props = {}

    this.readable = true;
    this.writable = false;
}

util.inherits(FileEntry, Stream);

// fake pipe for fun and profit
FileEntry.prototype.pipe = function (dest) {
    var algo = C.COMPRESSION_METHODS[this.header.compressionMethod],
        extractor = null, self = this;

    if (algo == 'DEFLATE') {
        // TODO: real stream! bl is redundant.

        extractor = zlib.createInflateRaw();
        extractor.on('error', function(err) {
          console.log('error extracting '+self.header.filename);
          console.log('header: '+JSON.stringify(self.header));
          this.emit('end');
        });
        return this.compressedData.pipe(extractor).pipe(dest);

    } else if(algo == 'NONE') {
      return this.compressedData.pipe(dest);
    } else {
        throw new Error('unhandled compression method ' + algo);
    }
}

FileEntry.prototype.extract = function (cb) {
    var algo = C.COMPRESSION_METHODS[this.header.compressionMethod];

    if (algo == 'DEFLATE') {
        // TODO: call zlib.inflateRaw, pass callback
        console.log('DEFLATE FOR ' + this.path);
    } else {
        throw new Error('unhandled compression method ' + algo);
    }
}

// placeholders for now
FileEntry.prototype.pause   = function () {}
FileEntry.prototype.resume  = function () {}

module.exports = FileEntry;
