// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { initJsApi, initSession } from "./jsApi";
import type { dh as DhType } from "./jsapi-types";

const CONNECT_COMMAND = "dh-vscode-core.connect";
const RUN_CODE_COMMAND = "dh-vscode-core.runCode";
const RUN_SELECTION_COMMAND = "dh-vscode-core.runSelection";

let connectStatusBarItem: vscode.StatusBarItem;
let ide: DhType.IdeSession | null = null;

/* eslint-disable @typescript-eslint/naming-convention */
const icons = {
  Figure: "📈",
  "deephaven.plot.express.DeephavenFigure": "📈",
  Table: "⬜",
  "deephaven.ui.Element": "✨",
} as const;
type IconType = keyof typeof icons;
/* eslint-enable @typescript-eslint/naming-convention */

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "dh-vscode-core" is now active!'
  );

  const outputChannel = vscode.window.createOutputChannel("Deephaven", "log");

  async function initDh() {
    const authType = await vscode.window.showQuickPick([
      "Anonymous",
      "Pre-Shared Key",
    ]);

    const dh = await initJsApi();

    const credentials =
      authType === "Anonymous"
        ? {
            type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
          }
        : {
            type: "io.deephaven.authentication.psk.PskAuthenticationHandler",
            token: await vscode.window.showInputBox({
              placeHolder: "Pre-Shared Key",
              prompt: "Enter your Deephaven pre-shared key",
            }),
          };

    outputChannel.show();

    ide = await initSession(dh, credentials);

    ide.onLogMessage((message: DhType.ide.LogItem) => {
      if (message.logLevel === "STDOUT" || message.logLevel === "ERROR") {
        outputChannel.appendLine(message.message.replace(/\n$/, ""));
      }
    });
  }

  async function onRunCode(editor: vscode.TextEditor, selectionOnly = false) {
    if (editor.document.languageId !== "python") {
      // This should not actually happen
      console.log(`languageId '${editor.document.languageId}' not supported.`);
      return;
    }

    if (ide == null) {
      await initDh();
    }

    const selectionRange =
      selectionOnly && editor.selection?.isEmpty === false
        ? new vscode.Range(
            editor.selection.start.line,
            editor.selection.start.character,
            editor.selection.end.line,
            editor.selection.end.character
          )
        : undefined;

    const text = editor.document.getText(selectionRange);

    console.log("Sending text to dh:", text);
    const result = await ide!.runCode(text);

    const changed = [...result.changes.created, ...result.changes.updated];

    console.log("test:", changed);
    changed.forEach(({ title, type }) => {
      const icon = icons[type as IconType] ?? type;
      outputChannel.appendLine(`${icon} ${title}`);
    });
  }

  // const connectCmd = vscode.commands.registerCommand(
  //   CONNECT_COMMAND,
  //   async () => {
  //     await initDh();

  //     ide!.runCode("print('Vscode extension connected!')");

  //     vscode.window.showInformationMessage("Connected to Deephaven server");
  //   }
  // );
  // connectStatusBarItem = createConnectStatusBarItem();

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    (editor) => {
      onRunCode(editor);
    }
  );

  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async (editor) => {
      onRunCode(editor, true);
    }
  );

  context.subscriptions.push(outputChannel, runCodeCmd, runSelectionCmd);
}

export function deactivate() {}

// /** Create a status bar item for connecting to DH server */
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
