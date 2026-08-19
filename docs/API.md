# API reference

All times are finite non-negative numbers in seconds. Every operation returns a Promise and accepts optional execution settings as its second argument.

## Sources and execution options

`MediaSource` is a local path, an HTTPS string/`URL`, or `{ url, headers }`. Remote sources are staged into temporary storage with bounded redirects, time, and size. `OperationOptions` provides `ffmpegPath`, `ffprobePath`, `signal`, `timeoutMs`, `tempDirectory`, `concurrency` (default 4, maximum 32), remote-policy overrides, structured logging, and `onProgress`.

## `probe(source, options?)`

Returns `MediaInfo` with format, duration, size, bitrate, and normalized video/audio/subtitle stream properties. Still images have duration `0`.

## `concat(request, options?)`

`request.inputs` must contain at least two `{ source, transitionAfter? }` entries. A transition belongs to the boundary after its input and may be `crossfade` or `fade-through-black`. The final input cannot specify a transition.

```ts
await concat({
  inputs: [
    { source: 'one.mp4', transitionAfter: { type: 'fade-through-black', duration: 0.5 } },
    { source: 'two.mp4' },
  ],
  output: { path: 'joined.mp4', strategy: 'auto', overwrite: false },
});
```

Mixed audio/no-audio encoded inputs currently produce video-only output. Supply audio on every clip when the joined result must retain audio.

## `edit(request, options?)`

Combines these options in one FFmpeg filter graph:

- `trim: { start?, end? }` and sorted non-overlapping `remove` ranges
- `resize: { width, height, fit: 'contain' | 'cover' | 'fill' }`
- `crop`, 0/90/180/270-degree `rotate`, horizontal/vertical/both `flip`
- `speed` from 0.25 to 4
- `fadeIn`, `fadeOut`, `mute`, and `volume`
- additional `audioTracks` with start time and volume
- image/video `overlays` with time bounds, position, dimensions, and opacity

Filters and overlays require encoding; `strategy: 'copy'` is rejected for `edit` and `replaceSegments`.

## `replaceSegments(request, options?)`

Each replacement has `at`, `source`, optional `sourceStart`, and optional `duration`. Omitted duration means the remaining replacement-source duration. The replaced base interval has the same duration as the inserted material, keeping the base timeline length unchanged. Replacements must not overlap or exceed either source.

## `thumbnails(request, options?)`

Provide `times`, `outputDirectory`, and optional `format`, `prefix`, dimensions, JPEG quality from 1–31, and overwrite policy. Files use deterministic zero-padded names and the function returns their absolute paths.

## Output encoding

`OutputOptions` contains `path`, `overwrite`, `strategy`, and video/audio settings. Default encoding is `libx264`, CRF 23, medium preset, `yuv420p`, AAC 192 kbps, and MP4 fast-start. Codec names are passed as individual argv values, never through a shell.

## Errors

`VideoStitchError` exposes `code`, optional `operation`, FFmpeg `exitCode`/`signal`, redacted `diagnostics`, and `cause`. Code against `code`; human-readable messages may improve in compatible releases.
