import ansiEscapes from 'ansi-escapes';
import wrapAnsi from 'wrap-ansi';

// Based on https://github.com/sindresorhus/log-update/blob/master/index.js

const originalWrite = Symbol('webpackbarWrite');

export default class LogUpdate {
  prevLineCount = 0;
  listening = false;
  extraLines = '';
  _streams = [process.stdout, process.stderr];

  render(lines) {
    this.listen();

    const wrappedLines = wrapAnsi(lines, this.columns, {
      trim: false,
      hard: true,
      wordWrap: false,
    });

    const data = ansiEscapes.eraseLines(this.prevLineCount) + wrappedLines + '\n' + this.extraLines;

    this.write(data);

    this.prevLineCount = data.split('\n').length;
  }

  get columns() {
    return (process.stderr.columns || 80) - 2;
  }

  write(data) {
    const stream = process.stderr;
    if (stream.write[originalWrite]) {
      stream.write[originalWrite].call(stream, data, 'utf-8');
    } else {
      stream.write(data, 'utf-8');
    }
  }

  clear() {
    this.done();
    this.write(ansiEscapes.eraseLines(this.prevLineCount));
  }

  done() {
    this.stopListen();

    this.prevLineCount = 0;
    this.extraLines = '';
  }

  _onData = data => {
    const str = String(data);
    const lines = str.split('\n').length - 1;
    if (lines > 0) {
      this.prevLineCount += lines;
      this.extraLines += data;
    }
  };

  listen() {
    // Prevent listening more than once
    if (this.listening) {
      return;
    }

    // Spy on all streams
    for (const stream of this._streams) {
      // Prevent overriding more than once
      if (stream.write[originalWrite]) {
        continue;
      }

      // Create a wrapper fn
      const write = (data, ...args) => {
        if (!stream.write[originalWrite]) {
          return stream.write(data, ...args);
        }
        this._onData(data);
        return stream.write[originalWrite].call(stream, data, ...args);
      };

      // Backup original write fn
      write[originalWrite] = stream.write;

      // Override write fn
      stream.write = write;
    }

    this.listening = true;
  }

  stopListen() {
    // Restore original write fns
    for (const stream of this._streams) {
      if (stream.write[originalWrite]) {
        stream.write = stream.write[originalWrite];
      }
    }

    this.listening = false;
  }
}
