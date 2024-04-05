// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { initJsApi, initSession } from "./jsApi";
import type { dh as DhType } from "./jsapi-types";

const CONNECT_COMMAND = "dh-vscode-core.connect";
const RUN_CODE_COMMAND = "dh-vscode-core.runCode";

let connectStatusBarItem: vscode.StatusBarItem;
let ide: any;

/* eslint-disable @typescript-eslint/naming-convention */
const icons = {
  Figure: "📈", // String.fromCodePoint(0x0001f4c8), // "📈", // "📊",
  "deephaven.plot.express.DeephavenFigure": "📈", // String.fromCodePoint(0x0001f4c8), // "📈",
  Table: "⬜", // "✅", // "\u2705", // "\uC29D", // "\u25A6",
  "deephaven.ui.Element": "✨", // "🔵", // "💹",
} as const;
type IconType = keyof typeof icons;
/* eslint-enable @typescript-eslint/naming-convention */

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "dh-vscode-core" is now active!'
  );

  const outputChannel = vscode.window.createOutputChannel("Deephaven", "log");

  async function initDh() {
    outputChannel.show();

    const dh = await initJsApi();
    ide = await initSession(dh);

    ide.onLogMessage((message: DhType.ide.LogItem) => {
      if (message.logLevel === "STDOUT" || message.logLevel === "ERROR") {
        outputChannel.appendLine(message.message.replace(/\n$/, ""));
      }
    });
  }

  setTimeout(async () => {
    initDh();
    // DH extension mucks with the global object in a way that breaks Copilot
    // activation. Introducing a delay so that Copilot has a chance to load first.
    // TODO: Figure out a better way
  }, 3000);

  // TODO: Possibly have a "Connect to Deephaven" status bar item
  // const connectCmd = vscode.commands.registerCommand(
  //   CONNECT_COMMAND,
  //   async () => {
  //     const dh = await initJsApi();
  //     ide = await initSession(dh);
  //     ide.runCode("print('Vscode extension connected!')");

  //     vscode.window.showInformationMessage("Connected to Deephaven server");
  //   }
  // );

  // connectStatusBarItem = createConnectStatusBarItem();

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    async (editor) => {
      const text = editor.document.getText();
      const result = await ide.runCode(text);

      const changed = [...result.changes.created, ...result.changes.updated];

      console.log("test:", changed);
      changed.forEach(({ title, type }) => {
        const icon = icons[type as IconType] ?? type;
        outputChannel.appendLine(`${icon} ${title}`);
      });
    }
  );

  context.subscriptions.push(runCodeCmd);
}

export function deactivate() {}

/** Create a status bar item for connecting to DH server */
// function createConnectStatusBarItem() {
//   const statusBarItem = vscode.window.createStatusBarItem(
//     vscode.StatusBarAlignment.Left,
//     100
//   );
//   statusBarItem.command = CONNECT_COMMAND;
//   statusBarItem.text = "$(debug-disconnect) Connect to Deephaven";
//   statusBarItem.show();

//   return statusBarItem;
// }
