# Performance

Version 2 optimizes structure before claiming machine-specific speedups:

- Filter-compatible edits compile into one FFmpeg invocation and one encoding pass.
- Stream-copy concat remains available when every stream is compatible.
- Full-size cut intermediates are not created. HTTPS inputs are the deliberate exception because they are staged for bounded, predictable access.
- Filesystem work is asynchronous and operation workspaces are cleaned on success, failure, timeout, and cancellation.

Run `npm run benchmark` on the same machine, FFmpeg build, and storage device. The report records wall time, output size/duration, operation count, and the pinned v1 baseline status. Absolute CI timing is informational because hosted-runner performance varies.

## Baseline result

On 2026-08-19, an Apple Silicon development machine using Node 22.23.2 and FFmpeg 8.0.1 produced this synthetic 1280×720 result:

| Operation                     | Version | Wall time | FFmpeg processing invocations |        Output |
| ----------------------------- | ------- | --------: | ----------------------------: | ------------: |
| compatible 6-second concat    | v1.7.1  |  69.63 ms |                             1 |  69,490 bytes |
| compatible 6-second concat    | v2 beta | 176.03 ms |                             1 |  69,490 bytes |
| 1-second timeline replacement | v2 beta | 435.32 ms |                             1 | 100,926 bytes |

The short stream-copy benchmark makes v2's FFmpeg/FFprobe version and compatibility checks visible; v1 starts concat without validating the binaries or streams. The output bytes were identical, and v2 met the structural one-processing-invocation requirement. This is a safety/performance tradeoff rather than a claim that v2 has lower startup latency for tiny clips. Filtered edits and larger real media are the more representative workload for the single-pass architecture.
