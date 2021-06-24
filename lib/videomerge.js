'use strict';

let _ = require('lodash');
let shelljs = require('shelljs');
let fs = require('fs');
let moment = require('moment');

let videoCut = require('./videocut');
let videoConcat = require('./videoconcat');

require('moment-duration-format');

module.exports = function videoMerge(spec) {
  let that = null;
  const durationFormat = 'hh:mm:ss';

  let originalVideo = null, clips = null;

  spec = _.defaults(spec || {}, {
    silent: true,
    ffmpeg_path:'ffmpeg'
  });

  function setOriginal(org) {
    if (!org.fileName || !org.duration) {
      throw new Error("Expected properties `fileName` or `duration` not found.");
    }
    originalVideo = org;
    originalVideo.startTime = moment.duration(originalVideo.startTime).format(durationFormat, { trim: false });
    originalVideo.duration = moment.duration(originalVideo.duration).format(durationFormat, { trim: false });
    return that;
  }

  function setClips(_clips) {
    if (_.isArray(_clips)) {
      clips = _clips.map(clip => {
        clip.startTime = moment.duration(clip.startTime).format(durationFormat, { trim: false });
        clip.duration = moment.duration(clip.duration).format(durationFormat, { trim: false });
        return clip;
      });
    } else {
      throw new Error('Expected parameter to be of type `Array`');
    }
    return that;
  }

  /**
   * Merges video clips together
   * @param  {string} mergeOpts.outputFileName Name of the output file
   * @return {Promise}
   */
  function doMerge(mergeOpts) {
    /**
     * 1. Cut original video into small clips
     * 2. Concat all the clips together
     */

    mergeOpts = mergeOpts || {};

    return videoCut(spec)
      .original(originalVideo)
      .exclude(clips)
      .cut()
      .then((videoClips) => {

        let combinedClips = [].concat(videoClips, clips);
        combinedClips = _.sortBy(combinedClips, 'startTime');

        return videoConcat(spec)
          .clips(combinedClips)
          .output(mergeOpts.outputFileName)
          .concat();

      });
  }

  that = Object.create({
    original: setOriginal,
    clips: setClips,
    merge: doMerge
  });


  return that;
}
