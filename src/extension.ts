// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { initDhcApi, initDhcSession } from "./dhc";
import type { dh as DhType } from "./dhc-types";
import type {
  EnterpriseDhType as DheType,
  IdeSession as DheSession,
  LogItem,
} from "./dhe-types";
import { getTempDir } from "./util";
import { initDheApi } from "./dhe";

// const CONNECT_COMMAND = "dh-in-vscode.connect";
const RUN_CODE_COMMAND = "dh-in-vscode.runCode";
const RUN_SELECTION_COMMAND = "dh-in-vscode.runSelection";

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
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  const dhcServerUrl = "http://localhost:10000";
  const dheVm = "bmingles-vm-f1";
  const dhePort = 8123;
  const dheHost = `${dheVm}.int.illumon.com:${dhePort}`;
  const dheServerUrl = `https://${dheHost}`;
  const dheWsUrl = `wss://${dheHost}/socket`;
  const type: "dhc" | "dhe" = "dhc";

  let dhcSession: DhType.IdeSession | null = null;
  let dheSession: DheSession | null = null;

  const panels = new Map<string, vscode.WebviewPanel>();
  const outputChannel = vscode.window.createOutputChannel("Deephaven", "log");

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  async function initDh(type: "dhc" | "dhe") {
    let dhc: typeof DhType | null = null;
    let dhe: DheType | null = null;

    try {
      if (type === "dhc") {
        dhc = await initDhcApi(dhcServerUrl);
      } else {
        dhe = await initDheApi(dheServerUrl);
      }
    } catch (err) {
      console.error(err);
      outputChannel.appendLine(`Failed to initialize Deephaven API: ${err}`);
      vscode.window.showErrorMessage("Failed to initialize Deephaven API");
      return;
    }

    if (type === "dhc") {
      dhcSession = await createDhcSession(dhc!, dhcServerUrl, outputChannel);

      if (dhcSession == null) {
        return;
      }

      dhcSession.onLogMessage((message: DhType.ide.LogItem) => {
        if (message.logLevel === "STDOUT" || message.logLevel === "ERROR") {
          outputChannel.appendLine(message.message.replace(/\n$/, ""));
        }
      });
    } else {
      dheSession = await createDheSession(dhe!, dheWsUrl);

      if (dheSession == null) {
        return;
      }

      dheSession.onLogMessage((message: LogItem) => {
        if (message.logLevel === "STDOUT" || message.logLevel === "ERROR") {
          outputChannel.appendLine(message.message.replace(/\n$/, ""));
        }
      });
    }

    outputChannel.show();
  }

  async function onRunCode(editor: vscode.TextEditor, selectionOnly = false) {
    if (editor.document.languageId !== "python") {
      // This should not actually happen
      console.log(`languageId '${editor.document.languageId}' not supported.`);
      return;
    }

    if (dhcSession == null) {
      await initDh(type);
    }

    if (dhcSession == null) {
      return;
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

    const result =
      type === "dhc"
        ? await dhcSession.runCode(text)
        : await dheSession!.runCode(text);

    const changed = [...result.changes.created, ...result.changes.updated];

    changed.forEach(({ title = "Unknown", type }, i) => {
      const icon = icons[type as IconType] ?? type;
      outputChannel.appendLine(`${icon} ${title}`);

      if (!panels.has(title)) {
        const panel = vscode.window.createWebviewPanel(
          "dhPanel", // Identifies the type of the webview. Used internally
          title,
          vscode.ViewColumn.Two,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        panels.set(title, panel);
      }

      panels.get(title)!.webview.html = getPanelHtml(dhcServerUrl, title);
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
  // const connectStatusBarItem = createConnectStatusBarItem();

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

async function createDheSession(
  dhe: DheType,
  wsUrl: string
): Promise<DheSession> {
  const client = new dhe.Client(wsUrl);

  await new Promise((resolve) =>
    // @ts-ignore
    client.addEventListener(dhe.Client.EVENT_CONNECT, resolve)
  );

  const credentials = { username: "iris", token: "iris", type: "password" };
  await client.login(credentials);

  // @ts-ignore
  const ide = new dhe.Ide(client);
  // @ts-ignore
  const cn = await ide.createConsole(new iris.ConsoleConfig());
  const session = await cn.startSession("python");

  return session;
}

async function createDhcSession(
  dhc: typeof DhType,
  serverUrl: string,
  outputChannel: vscode.OutputChannel
): Promise<DhType.IdeSession | null> {
  let ide: DhType.IdeSession | null = null;

  try {
    ide = await initDhcSession(dhc, serverUrl, {
      type: dhc.CoreClient.LOGIN_TYPE_ANONYMOUS,
    });
  } catch (err) {
    console.error(err);
    outputChannel.appendLine(`Failed to connect anonymously: ${err}`);
    try {
      const token = await vscode.window.showInputBox({
        placeHolder: "Pre-Shared Key",
        prompt: "Enter your Deephaven pre-shared key",
      });

      ide = await initDhcSession(dhc, serverUrl, {
        type: "io.deephaven.authentication.psk.PskAuthenticationHandler",
        token,
      });
    } catch (err) {
      console.error(err);
    }
  }

  if (ide == null) {
    vscode.window.showErrorMessage("Failed to connect to Deephaven server");
  } else {
    vscode.window.showInformationMessage("Connected to Deephaven server");
  }

  return ide;
}

function getEmbedWidgetUrl(serverUrl: string, title: string) {
  return `${serverUrl}/iframe/widget/?name=${title}`;
}

function getPanelHtml(serverUrl: string, title: string) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cat Coding</title>
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
        title
      )}&cachebust=${new Date().getTime()}" title="${title}"></iframe>
  </body>
  </html>`;
}
