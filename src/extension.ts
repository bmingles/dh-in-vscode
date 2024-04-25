// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getTempDir } from './util';
import DhcRunner from './dh/DhcRunner';
import DheRunner from './dh/DheRunner';

// const CONNECT_COMMAND = "dh-in-vscode.connect";
const RUN_CODE_COMMAND = 'dh-in-vscode.runCode';
const RUN_SELECTION_COMMAND = 'dh-in-vscode.runSelection';

type DhEnvType = 'dhc' | 'dhe';
let type: DhEnvType = 'dhc';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  // DHC
  const dhcServerUrl = 'http://localhost:10000';
  const dhePort = 8123;

  // DHE
  const dheVm = 'bmingles-vm-f1';
  const dheHost = `${dheVm}.int.illumon.com:${dhePort}`;
  const dheServerUrl = `https://${dheHost}`;
  const dheWsUrl = `wss://${dheHost}/socket`;

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  const runner =
    type === 'dhc'
      ? new DhcRunner(dhcServerUrl, outputChannel)
      : new DheRunner(dheServerUrl, outputChannel, dheWsUrl);

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    editor => {
      runner.runEditorCode(editor);
    }
  );

  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async editor => {
      runner.runEditorCode(editor, true);
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
