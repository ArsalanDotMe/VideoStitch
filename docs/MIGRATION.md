# Migrating from v1

Version 2 intentionally removes fluent builders, millisecond-like numeric ambiguity, input mutation, Bluebird, Moment, lodash, shelljs, synchronous temporary-file operations, and rejection values without useful diagnostics.

## Concat

```js
// v1
videoStitch
  .concat({ overwrite: true })
  .clips([{ fileName: 'a.mp4' }, { fileName: 'b.mp4' }])
  .output('out.mp4')
  .concat();

// v2
await concat({
  inputs: [{ source: 'a.mp4' }, { source: 'b.mp4' }],
  output: { path: 'out.mp4', overwrite: true },
});
```

## Cut/remove

```js
// v1: returned temporary clips for the retained regions
videoStitch
  .cut()
  .original({ fileName: 'in.mp4', duration: '00:00:30' })
  .exclude([{ startTime: '00:00:05', duration: '00:00:02' }])
  .cut();

// v2: writes the final edited result in one operation; times are seconds
await edit({ input: 'in.mp4', remove: [{ start: 5, end: 7 }], output: { path: 'out.mp4' } });
```

## Merge/replacement

```js
// v1
videoStitch
  .merge()
  .original({ fileName: 'base.mp4', duration: '00:00:30' })
  .clips([{ fileName: 'clip.mp4', startTime: '00:00:05', duration: '00:00:02' }])
  .merge();

// v2
await replaceSegments({
  input: 'base.mp4',
  replacements: [{ source: 'clip.mp4', at: 5, duration: 2 }],
  output: { path: 'out.mp4' },
});
```

## Other breaking changes

- `fileName` is now `source`; `ffmpeg_path` is `ffmpegPath` in operation options.
- Existing outputs fail by default instead of allowing FFmpeg to prompt indefinitely.
- HTTPS is downloaded under explicit redirect/size/time/network rules. HTTP and arbitrary protocols are rejected.
- Errors are `VideoStitchError` instances with stable codes and redacted FFmpeg diagnostics.
- FFmpeg and FFprobe 6.1+ are required and are not bundled.
- Imports are named ESM or CommonJS exports; there is no default export or fluent compatibility adapter.
