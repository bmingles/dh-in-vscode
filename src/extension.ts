// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { initJsApi, initSession } from "./jsApi";

const CONNECT_COMMAND = "dh-vscode-core.connect";
const RUN_CODE_COMMAND = "dh-vscode-core.runCode";

let connectStatusBarItem: vscode.StatusBarItem;
let ide: any;

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "dh-vscode-core" is now active!'
  );

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
      // TODO: cache session
      const dh = await initJsApi();
      ide = await initSession(dh);

      const text = editor.document.getText();
      ide.runCode(text);
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
