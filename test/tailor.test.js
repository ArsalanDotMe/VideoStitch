
'use strict';

let test = require('tape');
let path = require('path');
let videoStitch = require('../index');
let util = require('util');


test('Video Stitch Module', (t) => {
  let merger = videoStitch.merge;
  t.plan(1);
  merger()
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
})


test('Video Stitch Concat Module', (t) => {
  let videoConcat = videoStitch.concat;
  t.plan(1);
  videoConcat({
    silent: false,
    overwrite: true
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
    console.log('outputFileName: ', outputFileName);
    t.pass(outputFileName);
  })
  .catch(err => {
    t.fail(util.inspect(err));
  });
})
