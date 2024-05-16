import * as vscode from 'vscode';
import { DHFS_SCHEME } from '../common';

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

/**
 * Get a DH FS root URI for a server URL.
 * @param serverUrl
 * @returns
 */
export function serverUrlToFsRootUri(serverUrl: URL) {
  const uri = vscode.Uri.parse(
    `${DHFS_SCHEME}:/${serverUrl.protocol}${serverUrl.hostname}:${serverUrl.port}`
  );

  return uri;
}

/**
 * Get server url and path from a dhfs URI.
 * @param uri
 */
export function getServerUrlAndPath(uri: vscode.Uri) {
  // Convert format from:
  // '/https:some-host.com:8123/.vscode/settings.json' to
  // 'https://some-host.com:8123/.vscode/settings.json'
  const urlStr = uri.path.replace(/^(\/)(https?:)/, '$2//');
  const url = new URL(urlStr);

  const root = `${url.protocol}//${url.hostname}:${url.port}`;

  const trailingSlashRegEx = /.(\/)$/;
  const path = url.pathname.replace(trailingSlashRegEx, '');

  return {
    root,
    path,
  };
}
