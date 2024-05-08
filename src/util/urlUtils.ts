/**
 * Ensure url has a trailing slash.
 * @param url
 */
export function ensureHasTrailingSlash(url: string | null) {
  if (url == null) {
    return url;
  }

  return url.endsWith('/') ? url : `${url}/`;
}
