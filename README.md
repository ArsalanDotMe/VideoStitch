# VideoStitch

VideoStitch is a type-safe Node.js library for reliable video editing with FFmpeg. Version 2 is a complete rewrite with direct Promise-based APIs, ESM and CommonJS support, managed HTTPS inputs, cancellation, progress reporting, and no runtime npm dependencies.

> Version 2 is currently in prerelease. The fluent v1 API is intentionally not supported; see the [migration guide](docs/MIGRATION.md).

## Requirements

- Node.js 22 or newer
- FFmpeg and FFprobe 6.1 or newer on `PATH`, or explicit binary paths
- An FFmpeg build with the encoders selected by your output configuration. The default MP4 preset uses `libx264` and `aac`.

VideoStitch does not download or bundle FFmpeg.

## Installation

```sh
npm install video-stitch@next
```

## Quick start

```ts
import { concat, edit, probe, replaceSegments, thumbnails } from 'video-stitch';

const information = await probe('intro.mp4');
console.log(information.duration, information.streams);

await concat({
  inputs: [
    { source: 'intro.mp4', transitionAfter: { type: 'crossfade', duration: 0.4 } },
    { source: 'chapter.mp4' },
  ],
  output: { path: 'joined.mp4' },
});

await edit({
  input: 'joined.mp4',
  output: { path: 'edited.mp4' },
  trim: { start: 1, end: 20 },
  remove: [{ start: 5, end: 7 }],
  resize: { width: 1280, height: 720, fit: 'cover' },
  fadeIn: 0.25,
  fadeOut: 0.5,
  volume: 0.8,
});
```

CommonJS uses the same named API:

```js
const { concat } = require('video-stitch');
```

## Operations

- `probe(source, options?)` returns normalized container, stream, codec, duration, size, frame-rate, rotation, and audio-layout metadata.
- `concat(request, options?)` joins compatible inputs with stream copy or safely transcodes them; crossfade and fade-through-black transitions are supported.
- `edit(request, options?)` combines trim/removal, resizing, crop, rotation, flip, speed, fades, volume, mute, audio mixing, and image/video overlays into one filter graph.
- `replaceSegments(request, options?)` replaces non-overlapping base-video intervals while preserving the base timeline duration.
- `thumbnails(request, options?)` extracts one or many PNG/JPEG frames in one FFmpeg process.

Complete request and option contracts are included in the bundled TypeScript declarations.

## Encoding behavior

Outputs default to `strategy: 'auto'`:

- Filter-free concat uses stream copy only when every stream layout and codec is compatible.
- Timeline edits, transitions, uncertain keyframe cuts, and incompatible concat inputs transcode.
- The portable default is H.264 (`libx264`), AAC, `yuv420p`, CRF 23, and `+faststart`.
- `strategy: 'copy'` rejects incompatible inputs instead of silently changing quality.
- `strategy: 'encode'` always uses the configured encoding preset.

Outputs are written to an adjacent temporary path and committed only after FFmpeg succeeds. Existing files are rejected unless `overwrite: true`.

## HTTPS inputs and security

Local paths and HTTPS URLs are supported. HTTP, FTP, `file://`, embedded URL credentials, loopback, link-local, and private-network destinations are rejected by default. Remote media is downloaded into an isolated operation workspace before FFmpeg sees it.

Defaults are five HTTPS-only redirects, a 30-second stall timeout, a 30-minute total timeout, and 2 GiB per source. Authorization and cookie headers are removed on cross-origin redirects and redacted from logs and errors. Private-network access can be explicitly enabled for trusted applications.

VideoStitch always starts FFmpeg with an argument array and `shell: false`. There is no raw-arguments escape hatch.

```ts
await probe(
  { url: 'https://cdn.example/video.mp4', headers: { Authorization: 'Bearer …' } },
  { remote: { maxBytes: 512 * 1024 * 1024 } },
);
```

## Progress, cancellation, and errors

```ts
import { edit, VideoStitchError } from 'video-stitch';

const controller = new AbortController();

try {
  await edit(request, {
    signal: controller.signal,
    timeoutMs: 15 * 60_000,
    concurrency: 4,
    onProgress(event) {
      console.log(event.phase, event.percent);
    },
  });
} catch (error) {
  if (error instanceof VideoStitchError) {
    console.error(error.code, error.diagnostics);
  }
}
```

Stable codes include `INVALID_INPUT`, `FFMPEG_NOT_FOUND`, `UNSUPPORTED_FFMPEG`, `SOURCE_NOT_FOUND`, `REMOTE_SOURCE_DENIED`, `REMOTE_FETCH_FAILED`, `OUTPUT_EXISTS`, `INCOMPATIBLE_MEDIA`, `PROCESS_FAILED`, `TIMEOUT`, and `ABORTED`.

## Development

```sh
npm ci
npm run verify
```

Integration tests generate deterministic H.264/AAC clips and an image overlay from FFmpeg test sources in a temporary directory. They exercise each public operation with real FFmpeg processes and verify output metadata; they do not inspect pixels or audio samples. No binary fixtures are stored in Git or included in the package. Release maintainers should also read [docs/RELEASING.md](docs/RELEASING.md).

## License

[ISC](LICENSE)
