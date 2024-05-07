import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as ws from 'ws';

export class CustomEvent extends Event {
  constructor(...args: ConstructorParameters<typeof Event>) {
    super(...args);
  }
}

export function getTempDir(recreate = false) {
  const tempDir = path.join(__dirname, 'tmp');

  if (recreate) {
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore if can't delete. Likely doesn't exist
    }
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  return tempDir;
}

/**
 * Require a JS module from a URL. Loads the module in memory and returns its exports
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 *
 * @param {string} url The URL with protocol to require from. Supports http or https
 * @returns {Promise<string>} Promise which resolves to the module's exports
 */
export async function downloadFromURL(
  url: string,
  retries = 10,
  retryDelay = 1000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    let transporter: typeof http | typeof https;
    if (urlObj.protocol === 'http:') {
      transporter = http;
    } else if (urlObj.protocol === 'https:') {
      transporter = https;
    } else {
      reject(
        `Only http: and https: protocols are supported. Received ${urlObj.protocol}`
      );
      return;
    }

    transporter
      .get(url, { timeout: 5000 }, res => {
        let file = '';
        res.on('data', d => {
          file += d;
        });

        res.on('end', async () => {
          resolve(file);
        });
      })
      .on('timeout', () => {
        console.error('Failed download of url:', url);
        reject();
      })
      .on('error', e => {
        if (retries > 0) {
          console.error('Retrying url:', url);
          setTimeout(
            () =>
              downloadFromURL(url, retries - 1, retryDelay).then(
                resolve,
                reject
              ),
            retryDelay
          );
        } else {
          console.error(
            `Hit retry limit. Stopping attempted include from ${url} with error`
          );
          console.error(e);
          reject();
        }
      });
  });
}

export function getEmbedWidgetUrl(
  serverUrl: string,
  title: string,
  psk?: string
) {
  serverUrl = serverUrl.replace(/\/$/, '');
  return `${serverUrl}/iframe/widget/?name=${title}${psk ? `&psk=${psk}` : ''}`;
}

export function getPanelHtml(iframeUrl: string, title: string) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Deephaven</title>
      <style>
      html, body {
        height: 100%;
        overflow: hidden;
      }
      iframe {
        border: none;
        width: 100%;
        height: 100%;
      }
      </style>
  </head>
  <body>
      <script>
      (function() {
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', ({ data }) => {
          if (data.message === 'io.deephaven.message.LoginOptions.request') {
            console.log('LoginOptions request received from iframe', data);
            vscode.postMessage({ data });
            return;
          }

          if (data.message === 'io.deephaven.message.SessionDetails.request') {
            console.log('SessionDetails request received from iframe', data);
            vscode.postMessage({ data });
            return;
          }

          if (data.message === 'vscode-ext.loginOptions') {
            console.log('Received login message from ext', data);
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          if (data.message === 'vscode-ext.sessionDetails') {
            console.log('Received session message from ext', data);
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          console.log('Unknown message type', data);
        });
      }())
      </script>
      <iframe id="content-iframe" src="${iframeUrl}&cachebust=${new Date().getTime()}" title="${title}"></iframe>
  </body>
  </html>`;
}

export function normalizeUrl(url: string | null) {
  if (url == null) {
    return url;
  }

  return url.endsWith('/') ? url : `${url}/`;
}

export function polyfillDh() {
  class Event {
    type: string;
    detail: unknown;

    constructor(type: string, dict: { detail: unknown }) {
      this.type = type;
      if (dict) {
        this.detail = dict.detail;
      }
    }
  }

  // Copilot will look for `window.document.currentScript` if it finds `window`.
  // Since we are polyfilling `window` below, we also need to set `document` to
  // avoid a "Cannot read properties of undefined (reading 'currentScript')"
  // error when Copilot extension is activated. Note that this scenario is only
  // hit if the polyfill runs before Copilot extension is activated.
  /* @ts-ignore */
  global.document = {};

  // Copied from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
  /* @ts-ignore */
  global.self = global;
  /* @ts-ignore */
  global.window = global;
  /* @ts-ignore */
  global.this = global;
  /* @ts-ignore */
  global.Event = Event;
  /* @ts-ignore */
  global.CustomEvent = CustomEvent;
  /* @ts-ignore */
  global.WebSocket = ws;

  // This is needed to mimic running in a local http browser environment when
  // making requests to the server. This at least impacts websocket connections.
  // Not sure if it is needed for other requests. The url is an arbitrary
  // non-https url just to make it stand out in logs.
  // @ts-ignore
  global.window.location = new URL('http://dh-in-vscode.localhost/');
}
