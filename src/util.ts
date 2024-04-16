import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import * as ws from "ws";

export class CustomEvent extends Event {
  constructor(...args: ConstructorParameters<typeof Event>) {
    super(...args);
  }
}

export function getTempDir(recreate = false) {
  const tempDir = path.join(__dirname, "tmp");

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
    if (urlObj.protocol === "http:") {
      transporter = http;
    } else if (urlObj.protocol === "https:") {
      transporter = https;
    } else {
      reject(
        `Only http: and https: protocols are supported. Received ${urlObj.protocol}`
      );
      return;
    }

    transporter
      .get(url, { timeout: 5000 }, (res) => {
        let file = "";
        res.on("data", (d) => {
          file += d;
        });

        res.on("end", async () => {
          resolve(file);
        });
      })
      .on("timeout", () => {
        console.error("Failed download of url:", url);
        reject();
      })
      .on("error", (e) => {
        if (retries > 0) {
          console.error("Retrying url:", url);
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
  return `${serverUrl}/iframe/widget/?name=${title}${psk ? `&psk=${psk}` : ""}`;
}

export function getPanelHtml(serverUrl: string, title: string, psk?: string) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Deephaven</title>
      <style>
      iframe, html, body {
        border: none;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      </style>
  </head>
  <body>
      <iframe src="${getEmbedWidgetUrl(
        serverUrl,
        title,
        psk
      )}&cachebust=${new Date().getTime()}" title="${title}"></iframe>
  </body>
  </html>`;
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
}
