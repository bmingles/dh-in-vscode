// import * as ws from "ws";
import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ws from "ws";
import type { dh as DhType } from "../src/jsapi-types";

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

  const tempDir = path.join(__dirname, "tmp");

  await downloadDhFromServer(serverUrl, tempDir);
  // const dh = (await dynamicImport(path.join(tempDir, "dh-core.cjs"))).default;

  const dh = require(path.join(tempDir, "dh-core.cjs"));

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
 * to `out/tmp` as `.cjs` files (renaming of import / export to cjs compatible code).
 * 2. requires `dh-core.mjs` and return the default export.
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 * NOTE: there is a limitation in current vscode extension apis such that es6 imports are not supported. This is why
 * we have to save / convert to .cjs.
 * See https://stackoverflow.com/questions/70620025/how-do-i-import-an-es6-javascript-module-in-my-vs-code-extension-written-in-type
 */
async function downloadDhFromServer(serverUrl: string, outDir: string) {
  try {
    fs.rmSync(outDir, { recursive: true });
  } catch {
    // Ignore if can't delete. Likely doesn't exist
  }

  fs.mkdirSync(outDir);
  const dhInternal = await downloadFromURL(
    path.join(serverUrl, "jsapi/dh-internal.js")
  );
  // Convert to .cjs
  fs.writeFileSync(
    path.join(outDir, "dh-internal.cjs"),
    dhInternal.replace(
      `export{__webpack_exports__dhinternal as dhinternal};`,
      `module.exports={dhinternal:__webpack_exports__dhinternal};`
    )
  );

  const dhCore = await downloadFromURL(
    path.join(serverUrl, "jsapi/dh-core.js")
  );
  fs.writeFileSync(
    path.join(outDir, "dh-core.cjs"),
    // Convert to .cjs
    dhCore
      .replace(
        `import {dhinternal} from './dh-internal.js';`,
        `const {dhinternal} = require("./dh-internal.cjs");`
      )
      .replace(`export default dh;`, `module.exports = dh;`)
  );
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
