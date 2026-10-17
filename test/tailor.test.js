
'use strict';

let test = require('tape');
let path = require('path');
let videoStitch = require('../index');
let util = require('util');
const { execFileSync } = require('child_process');
const ffmpeg = 'ffmpeg';
function duration(file) {
 return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration', '-of', 'default=nw=1:nk=1', file], {encoding:'utf8'}));
}

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
  .output(path.join(__dirname, 'assets', 'concat-test-output.mp4'))
  .concat()
  .then((outputFileName) => {
    t.pass(outputFileName);
    let input1_duration = duration(path.join(__dirname, 'assets', 'tailor-5-10.mp4'));
    let input2_duration = duration(path.join(__dirname, 'assets', 'tailor-20-25.mp4'));
    let output_duration = duration(outputFileName);
    t.equal(parseInt(input1_duration) + parseInt(input2_duration), parseInt(output_duration));
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
  .output(path.join(__dirname, 'assets', 'concat-spaces-test-output.mp4'))
  .concat()
  .then((outputFileName) => {
    t.pass(outputFileName);
    let input1_duration = duration(path.join(__dirname, 'assets', 'tailor-5-10.mp4'));
    let input2_duration = duration(path.join(__dirname, 'assets', 'tailor-20 to 25.mp4'));
    let output_duration = duration(outputFileName);
    t.equal(parseInt(input1_duration) + parseInt(input2_duration), parseInt(output_duration));
  })
  .catch(err => {
    t.fail(util.inspect(err));
  });
});
