// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { initJsApi } from "./jsApi";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "dh-vscode-core" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "dh-vscode-core.helloWorld",
    async () => {
      // class Event {
      //   constructor(type, dict) {
      //     this.type = type;
      //     if (dict) {
      //       this.detail = dict.detail;
      //     }
      //   }
      // }

      // class CustomEvent extends Event {
      //   constructor(...args) {
      //     super(...args);
      //   }
      // }

      // // @ts-ignore
      // global.self = global;
      // // @ts-ignore
      // global.window = global;
      // // @ts-ignore
      // global.window.location = new URL("http://localhost:10000");
      // // @ts-ignore
      // global.Event = Event;
      // // @ts-ignore
      // global.CustomEvent = CustomEvent;
      // // @ts-ignore
      // global.WebSocket = require("ws");

      // Copied from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
      /* @ts-ignore */
      // global.self = global;
      // global.window = global;
      // global.this = global;
      // global.Event = Event;
      // global.CustomEvent = CustomEvent;
      // global.WebSocket = ws;
      // global.window.location = new URL("http://localhost:10000");

      // const dh = (await dynamicImport("../lib/dh-core.mjs")).default;

      const dh = await initJsApi();

      // See https://github.com/deephaven/deephaven.io/blob/0675158d60c0864b51cfab5616a83671c3171130/tools/run-examples/createSnapshots.mjs#L227
      const type = "python";
      const client = new dh.CoreClient("http://localhost:10000", {});
      await client.login({ type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS });
      const cn = await client.getAsIdeConnection();
      const ide = await cn.startSession(type);

      console.log("cn:", ide.runCode("print('Hello, world!')"));

      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from dh-vscode-core!");
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
