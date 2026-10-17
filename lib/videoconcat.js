'use strict';

let tmp = require('tmp');
let fext = require('file-extension');
let fs = require('fs');
const runFFmpeg = require('./run-ffmpeg');
let _ = require('lodash');

module.exports = function (spec) {

	let that = null;
	let clips = [];
	let outputFileName = tmp.tmpNameSync({
		prefix: 'video-output-',
    postfix: '.mp4'
	});

	spec = _.defaults(spec, {
    silent: true,
    overwrite: null,
    ffmpeg_path:'ffmpeg'
  });

  function handleOverwrite() {
    switch (spec.overwrite) {
      case true:
        return '-y'
      case false:
        return '-n'
      default:
        return ''
    }
  }

	function setClips(_clips) {
		if (Array.isArray(_clips)) {
			clips = _clips;
		} else {
			throw new Error('Expected parameter to be of type `Array`');
		}
		return that;
	}

	function setOutput(fileName) {

		if (fileName) {

			outputFileName = fileName;
		}
    return that;
	}

  /**
   * concatenates clips together using a fileList
   * @param  {string} args.fileList Address of a text file containing filenames of the clips
   * @return {[type]}      [description]
   */
  function concatClips(args) {
    const overwrite = handleOverwrite();
    const ffArgs = ['-f', 'concat', '-safe', '0', '-protocol_whitelist',
      'file,http,https,tcp,tls,crypto', '-i', String(args.fileList),
      '-c', 'copy', String(outputFileName)];
    if (overwrite) ffArgs.push(overwrite);
    return runFFmpeg(spec.ffmpeg_path, ffArgs, spec.silent).then(() => outputFileName);
  }

  function escapePath(pathString) {
    if (typeof pathString !== 'string' || /[\r\n\0]/.test(pathString)) {
      throw new Error('Clip filename must be a string without CR, LF or NUL');
    }
    // FFmpeg concat syntax: close the quote, escape the apostrophe, reopen it.
    return pathString.replace(/'/g, "'\\''");
  }

  function getLineForClip(clip) {
    return `file '${escapePath(clip.fileName)}'`;
  }

  function getTextForClips(clips) {
    return clips.map(getLineForClip).join('\n');
  }

  function doConcat() {


    let fileListText = getTextForClips(clips);

    let fileListFilename = tmp.tmpNameSync({
      postfix: '.txt'
    });

    fs.writeFileSync(fileListFilename, fileListText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

    return concatClips({
      fileList: fileListFilename,
    }).finally(() => {
      fs.unlinkSync(fileListFilename);
    });
  }

	that = Object.create({
		clips: setClips,
		output: setOutput,
		concat: doConcat,
	});

	return that;
}
