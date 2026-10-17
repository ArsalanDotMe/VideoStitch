'use strict';

// Execute FFmpeg directly, never through a shell.
const { spawn } = require('child_process');

module.exports = function runFFmpeg(executable, args, silent) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: silent ? 'ignore' : ['ignore', 'inherit', 'inherit'],
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`FFmpeg failed (code ${code}, signal ${signal})`);
        error.code = code;
        error.signal = signal;
        reject(error);
      }
    });
  });
};
