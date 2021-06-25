
'use strict';

let test = require('tape');
let path = require('path');
let videoStitch = require('../index');
let util = require('util');
let shelljs = require('shelljs');
const ffmpeg = require('ffmpeg-static')

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
    let input1_duration = shelljs.exec(`ffmpeg -i "${path.join(__dirname, 'assets', 'tailor-5-10.mp4')}" 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
    let input2_duration = shelljs.exec(`ffmpeg -i "${path.join(__dirname, 'assets', 'tailor-20-25.mp4')}" 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
    let output_duration = shelljs.exec(`ffmpeg -i ${outputFileName} 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
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
  .output(path.join(__dirname, 'assets', 'concated_video_test_output.mp4'))
  .concat()
  .then((outputFileName) => {
    t.pass(outputFileName);
    let input1_duration = shelljs.exec(`ffmpeg -i "${path.join(__dirname, 'assets', 'tailor-5-10.mp4')}" 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
    let input2_duration = shelljs.exec(`ffmpeg -i "${path.join(__dirname, 'assets', 'tailor-20 to 25.mp4')}" 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
    let output_duration = shelljs.exec(`ffmpeg -i ${outputFileName} 2>&1 | grep "Duration"| cut -d ' ' -f 4 | sed s/,// | sed 's@\\..*@@g' | awk '{ split($1, A, ":"); split(A[3], B, "."); print 3600*A[1] + 60*A[2] + B[1] }'`, { silent: true }).output;
    t.equal(parseInt(input1_duration) + parseInt(input2_duration), parseInt(output_duration));
  })
  .catch(err => {
    t.fail(util.inspect(err));
  });
});
