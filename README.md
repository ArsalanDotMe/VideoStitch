# VideoStitch
A node module that performs cutting, clips extraction, merging on videos using ffpmeg.

# Requirements
This module is tested against **FFMPEG 3.x** only. Later versions should work though but are untested at this point. 
Please test and report your findings. 

Note that ffmpeg executable must be in your PATH for this module to work.

# Video Merge Usage
Video merge overwrites given clips on top of an original video and outputs the final video.



```javascript
'use strict';

let videoStitch = require('video-stitch');

let videoMerge = videoStitch.merge;

videoMerge()
  .original({
    "fileName": "FILENAME",
    "duration": "hh:mm:ss"
  })
  .clips([
    {
      "startTime": "hh:mm:ss",
      "fileName": "FILENAME",
      "duration": "hh:mm:ss"
    },
    {
      "startTime": "hh:mm:ss",
      "fileName": "FILENAME",
      "duration": "hh:mm:ss"
    },
    {
      "startTime": "hh:mm:ss",
      "fileName": "FILENAME",
      "duration": "hh:mm:ss"
    }
  ])
  .merge()
  .then((outputFile) => {
    console.log('path to output file', outputFile);
  });
```

# Video Cut Usage
Takes an original video, applies required cuts to exclude specified regions (clips) and gives you back the resulting clips of the originally cut video.

```javascript
'use strict';

let videoStitch = require('video-stitch');

let videoCut = videoStitch.cut;

videoCut({
    silent: true // optional. if set to false, gives detailed output on console
  })
  .original({
    "fileName": "FILENAME",
    "duration": "hh:mm:ss"
  })
  .exclude([
    {
      "startTime": "hh:mm:ss",
      "duration": "hh:mm:ss"
    },
    {
      "startTime": "hh:mm:ss",
      "duration": "hh:mm:ss"
    },
    {
      "startTime": "hh:mm:ss",
      "duration": "hh:mm:ss"
    }
  ])
  .cut()
  .then((videoClips) => {
    // [{startTime, duration, fileName}]
  });
```

# Video Concat Usage
Takes a bunch of clips and joins them together.

```javascript
'use strict';

let videoStitch = require('video-stitch');

let videoConcat = videoStitch.concat;

videoConcat({
    silent: true, // optional. if set to false, gives detailed output on console
    overwrite: false // optional. by default, if file already exists, ffmpeg will ask for overwriting in console and that pause the process. if set to true, it will force overwriting. if set to false it will prevent overwriting.
  })
  .clips([
    {
      "fileName": "FILENAME"
    },
    {
      "fileName": "FILENAME"
    },
    {
      "fileName": "FILENAME"
    }
  ])
  .output("myfilename") //optional absolute file name for output file
  .concat()
  .then((outputFileName) => {
    
  });
```
