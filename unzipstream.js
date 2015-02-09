/*
 * readable/writable unzip stream
 */
var Stream  = require('stream').Stream,
    util    = require('util'),
    Parser  = require('./parser'),
    C       = require('./constants');

function UnzipStream() {
    var me = this;

    this.readable = true;
    this.writable = true;
    this.waiting = false;
    this.ended = false;
    this.parsing = true;
    this.needdrain = false;

    this.parser = new Parser();
    this._zipBuffer = new Buffer([]);

    this.parser.on('entry', function (entry) {
        // just pass that through
        me.emit('entry', entry);
    }).on('end', function() {
      me.parsing = false;
      //console.log('zipstream end');
      me.emit('end');
    }).on('error', function(err) {
      console.log('zs err: '+err);
      me.emit('error', err);
    }).on('empty', function(drain) {
      me._zipBuffer = me._zipBuffer.slice(drain);
    }).on('feed', function() {
      me.waiting = false;
      if(me.needdrain) {
        me.needdrain = false;
        me.emit('drain');
      }
    });

  Stream.call(this);
}

util.inherits(UnzipStream, Stream);

/*
 * when data comes in, gets piped to Parser
 * appropriate actions on parse events
 */
// TODO: This probably should be _write instead of write.
UnzipStream.prototype.write = function (data) {
  if(this.ended) {
    this.emit('error', new Error('Write after end.'));
  }
  var len = this._zipBuffer.length;
  if(len > 2000000) {
    this.emit('bufsize', this._zipBuffer.length);
  }
  
    if (data) {
      if(this.waiting) {
        this._zipBuffer = Buffer.concat([this._zipBuffer, data]);
        // TODO: Smarter queueing by converting this into a proper writable and letting pipe deal with buffering.
        if(len > 100000000) {
          this.needdrain = true;
          return false;
        } else {
          return true;
        }
      } else {
        this.waiting = true;
        this._zipBuffer = Buffer.concat([this._zipBuffer, data]);
        this.parser.parse(this._zipBuffer);
      }
    } else if(this._zipBuffer.length > 0) {
      // data === null -> end of input.
      var self = this;
      setImmediate(function wrapup() {
        if(self.parsing && self._zipBuffer.length > 0) {
          if(!self.waiting) {
            self.parser.parse(self._zipBuffer);
            self._zipBuffer = null;
          } else {
            setImmediate(wrapup);
          }
        } else if(!self.parsing) {
          return;
        }
      });
    }

    return true;
}

/*
 * patch pipe for use with fstream
 */
UnzipStream.prototype.pipe = function (dest) {
    if (typeof dest.add == 'function') {
        this.on('entry', function (entry) {
            dest.add(entry);
        });
    }

    // TODO: Will this even work without a _read method?
    Stream.prototype.pipe.call(this, dest);
}

UnzipStream.prototype.end = function (data) {
  if(this.ended) {
    return;
  }
    this.emit('finish');
    this.write(data);
    this.ended = true;
    this.writable = false;
}

module.exports = UnzipStream;
