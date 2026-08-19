const SECRET_HEADER = /^(authorization|cookie|proxy-authorization)$/i;

export function redactText(value: string): string {
  return value
    .replaceAll(/https:\/\/([^\s/@:]+):([^\s/@]+)@/giu, 'https://[redacted]@')
    .replaceAll(/(https:\/\/[^\s?'"#]+)\?[^\s'"#]*/giu, '$1?[redacted]')
    .replaceAll(/(authorization|cookie|proxy-authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]');
}

export function redactHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADER.test(name) ? '[redacted]' : value,
    ]),
  );
}

export function safeSourceLabel(value: string | URL): string {
  try {
    const url = value instanceof URL ? new URL(value) : new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(value);
  }
}
