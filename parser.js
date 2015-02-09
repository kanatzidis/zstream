// nodejs dependencies
var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    zlib = require('zlib');

// zstream dependencies
var C = require('./constants'),
    LocalFileHeader     = require('./headers/local-file-header'),
    CDFileHeader        = require('./headers/cd-file-header'),
    CDEndSignature      = require('./headers/cd-end-signature'),
    DataDescriptor      = require('./headers/data-descriptor'),
    FileEntry           = require('./file-entry');

var S = 0,
    P = C.P, // P of PK
    K = C.K, // K of PK
    states = {
        INITIAL:                    S++,
        LOCAL_FILE_HEADER:          S++,
        FILE_DATA:                  S++,
        DATA_DESCRIPTOR:            S++,
        CENTRAL_DIR_FILE_HEADER:    S++,
        END_CENTRAL_DIR:            S++
    }

function Parser() {
    this.state = 0; // INITIAL
    this._pos = 0;
    this.emitting = true;
    this.ended = false;
  EventEmitter.call(this);
}

util.inherits(Parser, EventEmitter);

Parser.prototype.parse = function (buf) {
  if(this.ended) {
    return;
  }

  var drain = 0;
    while (buf && this._pos < buf.length) {
        switch (this.state) {

            case states.INITIAL:
                if (buf[this._pos] == P && buf[this._pos+1] == K) {
                  if(buf.length-this._pos > 4) {
                    var sig = buf.readUInt32LE(this._pos);
                  } else {
                    this._pos+=4;
                    sig = null;
                  }

                    if (sig == C.LOCAL_FILE_HEADER_SIG) {
                      // Minimum header size
                      if(buf.length-this._pos >= 30) {
                        drain+= this.handleLocalFile(buf);
                      } else {
                        this._pos++;
                      }

                    } else if (sig == C.CENTRAL_DIR_FILE_HEADER_SIG) {
                      if(buf.length-this._pos >= 46) {
                        drain+= this.handleCDHeader(buf);
                      } else {
                        this._pos++;
                      }

                    } else if (sig == C.END_CENTRAL_DIR_SIG) {
                      if(buf.length-this._pos >= 22) {
                        drain+=this.handleEndOfCD(buf);
                      } else {
                        this._pos++;
                      }

                    } else if (sig == C.DATA_DESCRIPTOR_SIG) {
                        
                      if(buf.length-this._pos >= 16) {
                        drain+= this.handleDataDesc(buf);
                      } else {
                        this._pos++;
                      }
                    } else {
                        // signature not recognized
                        // advance parser past "PK"
                        this._pos += 2;
                    }

                } else {
                    // padding data, ignored
                    this._pos++;
                }

                continue;

            default:
                this._pos++;
        }
    }

    this.emit('empty', drain);
    this._pos = 0;
    this.emit('feed');

}

Parser.prototype.handleLocalFile = function (buf) {
    var buf = buf.slice(this._pos),
        header =  new LocalFileHeader(buf);
        if(header.incomplete || header.dataOffest+header.compressedSize < buf.length) {
          this._pos+=header.dataOffset+header.compressedSize;
          return 0;
        }
        entry  =  new FileEntry(header, buf, header.dataOffset);

    if(entry.incomplete) {
      this._pos += header.dataOffset+header.compressedSize;
      return 0;
    }

    // TODO: Data descriptors may or may not be preceded by a signature.

    if(this.emitting) {
      if(header.generalPurposeBitFlag === 8) {
        var self = this;
        this.emitting = false;
        if(this.listeners('desc-header').length > 0) {
          this.removeAllListeners(['desc-header']);
        }
        this.once('desc-header', function(head, buffer) {
          self.emitting = true;
          header.crc32 = head.crc32;
          header.compressedSize = head.compressedSize;
          header.uncompressedSize = head.uncompressedSize;
          self.emit('associated', header.dataOffset+header.compressedSize);
          self.emit('entry', new FileEntry(header, buffer, header.dataOffset));
        });
        this._pos += header.dataOffset+header.compressedSize;
        return 0;
      } else /*if(header.uncompressedSize !== 0)*/ {
        this._pos+= header.dataOffset + header.compressedSize;
        if(header.uncompressedSize !== 0) {
          this.emit('entry', entry);
        }
        return header.dataOffset + header.compressedSize;
      }
    } else {
      this._pos+= header.dataOffset + header.compressedSize;
      return 0;
    }

    this._pos += header.dataOffset + header.compressedSize;
    return header.dataOffset + header.compressedSize;
}

Parser.prototype.handleDataDesc = function(buffer) {

  var buf = buffer.slice(this._pos),
      header = new DataDescriptor(buf);

  var additional = 0;
  if(this.listeners('associated').length !== 0) {
    this.removeAllListeners(['associated']);
  }
  this.once('associated', function(len) {
    additional+= len;
  });
  this.emit('desc-header', header, buffer);

  this._pos += header.headerLength;
  if(additional === 0) {
    // There's probably a better way of handling this.
    throw 'desc header not associated with anything';
  }
  return header.headerLength += additional;
}

Parser.prototype.handleCDHeader = function (buf) {
    var buff = buf.slice(this._pos),
        header  = new CDFileHeader(buff);

    if(header.incomplete) {
    this._pos += header.headerLength;
      return 0;
    }
    var self = this;

    this.emit('cd-header', header);

    this._pos += header.headerLength;
    return header.headerLength;
}

Parser.prototype.handleEndOfCD = function (buf) {
    var buf = buf.slice(this._pos),
        sig = new CDEndSignature(buf);

    if(sig.incomplete) {
      this._pos += sig.signatureLength;
      return 0;
    }
    this.emit('end-of-cd', sig);
    //console.log('found end of cd');
    this.ended = true;

    // TODO: This will emit even if the unzipstream hasn't received a call to end(),
    // which might be an issue? Shouldn't ever happen.
    this.emit('end');
    this._pos += sig.signatureLength;
    return sig.signatureLength;
}

module.exports = Parser;
