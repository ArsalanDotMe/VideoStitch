import type { MediaInfo, MediaSource, OperationOptions } from './types.js';
import { assertSupportedExecutable } from './internal/process.js';
import { probePath } from './internal/probe.js';
import { safeSourceLabel } from './internal/redact.js';
import { resolveSource } from './internal/source.js';
import { withWorkspace } from './internal/workspace.js';

export async function probe(
  source: MediaSource,
  options: OperationOptions = {},
): Promise<MediaInfo> {
  return withWorkspace('probe', options, async (workspace) => {
    await assertSupportedExecutable(
      options.ffprobePath ?? 'ffprobe',
      'probe version check',
      options,
    );
    const path = await resolveSource(source, workspace, options);
    const label =
      typeof source === 'string'
        ? safeSourceLabel(source)
        : safeSourceLabel(source instanceof URL ? source : source.url);
    return probePath(path, label, options);
  });
}
