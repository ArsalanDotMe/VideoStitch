# VideoStitch
A node module that performs cutting, clips extraction, merging on videos using ffpmeg.

# Usage

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
