// import * as ws from "ws";
import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ws from "ws";
import type { dh as DhType } from "../src/jsapi-types";

// HACK: Prevent typescript compiler from converting dynamic `import` to `require`
const dynamicImport = new Function("specifier", "return import(specifier)");

export class CustomEvent extends Event {
  constructor(...args: ConstructorParameters<typeof Event>) {
    super(...args);
  }
}

export async function initJsApi(serverUrl: string): Promise<typeof DhType> {
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
  /* @ts-ignore */
  global.window.location = new URL(serverUrl);

  const dh = await loadDhFromServer(serverUrl);

  return dh;
}

export async function initSession(
  dh: typeof DhType,
  serverUrl: string,
  credentials: DhType.LoginCredentials
): Promise<DhType.IdeSession> {
  const type = "python";
  const client = new dh.CoreClient(serverUrl);

  await client.login(credentials);

  const cn = await client.getAsIdeConnection();
  return cn.startSession(type);
}

/**
 * Download and import the Deephaven JS API from the server.
 * 1. Download `dh-internal.js` and `dh-core.js` from the server and save them
 * to `out/tmp` as `.mjs` files (renaming the import of `dh-internal.js` to `dh-internal.mjs`).
 * 2. Dynamically import `dh-core.mjs` and return the default export.
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 */
async function loadDhFromServer(serverUrl: string) {
  const tempDir = path.join(__dirname, "tmp");
  try {
    fs.rmSync(tempDir, { recursive: true });
  } catch {
    // Ignore if can't delete. Likely doesn't exist
  }

  fs.mkdirSync(tempDir);
  const dhInternal = await downloadFromURL(
    path.join(serverUrl, "jsapi/dh-internal.js")
  );
  // Rename to .mjs to allow es6 import
  fs.writeFileSync(path.join(tempDir, "dh-internal.mjs"), dhInternal);

  const dhCore = await downloadFromURL(
    path.join(serverUrl, "jsapi/dh-core.js")
  );
  fs.writeFileSync(
    path.join(tempDir, "dh-core.mjs"),
    // Replace the internal import with the mjs version
    dhCore.replace(`from './dh-internal.js'`, `from './dh-internal.mjs'`)
  );

  return (await dynamicImport(path.join(tempDir, "dh-core.mjs"))).default;
}

/**
 * Require a JS module from a URL. Loads the module in memory and returns its exports
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 *
 * @param {string} url The URL with protocol to require from. Supports http or https
 * @returns {Promise<string>} Promise which resolves to the module's exports
 */
async function downloadFromURL(
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
      .get(url, (res) => {
        let file = "";
        res.on("data", (d) => {
          file += d;
        });

        res.on("end", async () => {
          resolve(file);
        });
      })
      .on("error", (e) => {
        if (retries > 0) {
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
