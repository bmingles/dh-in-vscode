// @ts-nocheck
import * as ws from "ws";
import type { dh as DhType } from "../src/jsapi-types";

// HACK: Prevent typescript compiler from converting dynamic `import` to `require`
const dynamicImport = new Function("specifier", "return import(specifier)");

export class CustomEvent extends Event {
  constructor(...args) {
    super(...args);
  }
}

export async function initJsApi() {
  class Event {
    constructor(type, dict) {
      this.type = type;
      if (dict) {
        this.detail = dict.detail;
      }
    }
  }

  // Copied from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
  /* @ts-ignore */
  global.self = global;
  global.window = global;
  global.this = global;
  global.Event = Event;
  global.CustomEvent = CustomEvent;
  global.WebSocket = ws;
  global.window.location = new URL("http://localhost:10000");

  const dh = (await dynamicImport("../lib/dh-core.mjs")).default;

  return dh;
}

export async function initSession(dh): DhType.IdeSession {
  const type = "python";
  const client = new dh.CoreClient("http://localhost:10000");
  await client.login({ type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS });
  const cn = await client.getAsIdeConnection();
  return cn.startSession(type);
}
