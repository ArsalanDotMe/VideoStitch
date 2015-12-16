'use strict';

let _ = require('lodash');
let moment = require('moment');
require('moment-duration-format');
let tmp = require('tmp');
let shelljs = require('shelljs');
let fext = require('file-extension');

let Promise = require('bluebird');

module.exports = function videoCut(spec) {
	let that = null;
	let originalVideo = null, clips = null;
	const durationFormat = 'hh:mm:ss';

	spec = _.defaults(spec, {
    silent: true,
  });

	function setOriginal(org) {
		if (!org.fileName || !org.duration) {
			throw new Error("Expected properties `fileName` or `duration` not found.");
		}
		originalVideo = org;
		return that;
	}

	function setClips(_clips) {
		if (_.isArray(_clips)) {

			clips = _(_clips).map(clip => {
				clip.duration = moment.duration(clip.duration).format(durationFormat, { trim: false });
				return clip;
			}).sortBy('startTime').value();

		} else {
			throw new Error('Expected parameter to be of type `Array`');
		}
		return that;
	}

	function getCutsForVideo(clips) {
		let originalCuts = [];

		clips.forEach((clip, index) => {

			let startForThisClip = index === 0
					? moment.duration()
					: moment.duration(clips[index - 1].startTime)
						.add(moment.duration(clips[index - 1].duration));

			let durationOfThisClip = moment.duration(clip.startTime).subtract(startForThisClip);

			originalCuts.push({
				startTime: startForThisClip.format(durationFormat, { trim: false }),
				duration: durationOfThisClip.format(durationFormat, { trim: false })
			});

		});

		// Add remaining clip
		let lastClip = clips[clips.length - 1];
		let lastClipStartTime = moment.duration(lastClip.startTime)
				.add(moment.duration(lastClip.duration));

		let lastClipDuration = moment.duration(originalVideo.duration)
			.subtract(lastClipStartTime);

		originalCuts.push({
			startTime: lastClipStartTime
				.format(durationFormat, { trim: false }),
			duration: lastClipDuration.format(durationFormat, { trim: false })
		});

		return originalCuts;
	}

	/**
	 * Cuts a video using ffmpeg
	 * @param  {string} args.startTime Start time of the cut in `hh:mm:ss` format.
	 * @param  {string} args.duration Duration of the cut in `hh:mm:ss` format.
	 * @param  {string} args.fileName Filename of the video to be cut
	 * @return {Promise} A promise for an object containing startTime, duration, and fileName of the cut clip.
	 */
	function cutVideo(args) {

	  let cutFileName = tmp.tmpNameSync({
	  	prefix: 'video-cut-',
	  	postfix: `.${fext(originalVideo.fileName)}`
	  });

	  return new Promise((resolve, reject) => {

	    let commandQuery =
	      `ffmpeg -i ${args.fileName} -ss ${args.startTime} -t ${args.duration} ${cutFileName} -y`;

	    let child = shelljs.exec(commandQuery, { async: true, silent: spec.silent });

	    child.on('exit', (code, signal) => {

	      if (code === 0) {

	        resolve({
	        	startTime: args.startTime,
	        	duration: args.duration,
	        	fileName: cutFileName,
	        });

	      } else {
	        reject({ err: { code: code, signal: signal } });
	      }

	    });

	  });
	}

	function doCut() {
		let originalVideoCuts = getCutsForVideo(clips);

		let cutPromises = originalVideoCuts.map((cut) => {

			return cutVideo({
				startTime: cut.startTime,
				duration: cut.duration,
				fileName: originalVideo.fileName,
			});
		});
		return Promise.all(cutPromises);
	}

	that = Object.create({
		original: setOriginal,
		exclude: setClips,
		cut: doCut,
	});

	return that;
}
