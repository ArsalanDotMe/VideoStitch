
'use strict';

let test = require('tape');
let path = require('path');
let videoStitch = require('../index');
let util = require('util');
let childProcess = require('child_process');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';

function getDuration(fileName) {
  return Number(childProcess.execFileSync(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    fileName
  ], { encoding: 'utf8' }).trim());
}

test('Video Stitch imports without shelljs', (t) => {
  t.plan(2);
  t.ok(videoStitch, 'module imports');
  t.notOk(require('../package.json').dependencies.shelljs, 'shelljs is not a runtime dependency');
});

test('Video Stitch Module', (t) => {
  let merger = videoStitch.merge;
  t.plan(1);
  merger({
    ffmpeg_path:ffmpeg
  })
    .original({
      duration: 30000,
      startTime: 0,
      fileName: path.join(__dirname, 'assets', 'tailor.mp4'),
    })
    .clips([
      {
        startTime: 5000,
        duration: 5000,
        fileName: path.join(__dirname, 'assets', 'tailor-5-10.mp4'),
      },
      {
        startTime: 20000,
        duration: 5000,
        fileName: path.join(__dirname, 'assets', 'tailor-20-25.mp4'),
      }
    ])
    .merge()
    .then((finalOutput) => {
      console.log('finalOutput: ', finalOutput);
      t.pass(finalOutput);
    })
    .catch(err => {
      t.fail(util.inspect(err));
    });
});


test('Video Stitch Concat Module', (t) => {
  let videoConcat = videoStitch.concat;
  t.plan(2);
  videoConcat({
    silent: false,
    overwrite: true,
    ffmpeg_path:ffmpeg
  })
  .clips([
    {
      fileName: path.join(__dirname, 'assets', 'tailor-5-10.mp4'),
    },
    {
      fileName: path.join(__dirname, 'assets', 'tailor-20-25.mp4'),
    }
  ])
  .output(path.join(__dirname, 'assets', 'concated_video_test_output.mp4'))
  .concat()
  .then((outputFileName) => {
    t.pass(outputFileName);
    let input1_duration = getDuration(path.join(__dirname, 'assets', 'tailor-5-10.mp4'));
    let input2_duration = getDuration(path.join(__dirname, 'assets', 'tailor-20-25.mp4'));
    let output_duration = getDuration(outputFileName);
    t.ok(Math.abs(input1_duration + input2_duration - output_duration) < 0.1, 'output duration matches inputs');
  })
  .catch(err => {
    t.fail(util.inspect(err));
  });
});

test('Video Stitch Concat Module - spaces in filepath', (t) => {
  let videoConcat = videoStitch.concat;
  t.plan(2);
  videoConcat({
    silent: false,
    overwrite: true,
    ffmpeg_path:ffmpeg
  })
  .clips([
    {
      fileName: path.join(__dirname, 'assets', 'tailor-5-10.mp4'),
    },
    {
      fileName: path.join(__dirname, 'assets', 'tailor-20 to 25.mp4'),
    }
  ])
  .output(path.join(__dirname, 'assets', 'concated_video_test_output.mp4'))
  .concat()
  .then((outputFileName) => {
    t.pass(outputFileName);
    let input1_duration = getDuration(path.join(__dirname, 'assets', 'tailor-5-10.mp4'));
    let input2_duration = getDuration(path.join(__dirname, 'assets', 'tailor-20 to 25.mp4'));
    let output_duration = getDuration(outputFileName);
    t.ok(Math.abs(input1_duration + input2_duration - output_duration) < 0.1, 'output duration matches inputs');
  })
  .catch(err => {
    t.fail(util.inspect(err));
  });
});

test('Video Cut excludes a segment that starts at 00:00:00', (t) => {
  t.plan(3);
  videoStitch.cut({ ffmpeg_path: ffmpeg })
    .original({
      fileName: path.join(__dirname, 'assets', 'tailor.mp4'),
      duration: '00:00:30'
    })
    .exclude([{
      startTime: '00:00:00',
      duration: '00:00:05'
    }])
    .cut()
    .then((clips) => {
      t.equal(clips.length, 1, 'does not invoke ffmpeg for a zero-duration leading clip');
      t.equal(clips[0].startTime, '00:00:05', 'remaining clip begins after excluded segment');
      t.equal(clips[0].duration, '00:00:25', 'remaining clip covers the rest of the video');
    })
    .catch(err => {
      t.fail(util.inspect(err));
      t.end();
    });
});
