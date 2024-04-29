// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getTempDir } from './util';
import DhcRunner from './dh/DhcRunner';
import DheRunner from './dh/DheRunner';

// const CONNECT_COMMAND = "dh-in-vscode.connect";
const RUN_CODE_COMMAND = 'dh-in-vscode.runCode';
const RUN_SELECTION_COMMAND = 'dh-in-vscode.runSelection';
const SELECT_CONNECTION_COMMAND = 'dh-in-vscode.selectConnection';

type ConnectionType = 'DHC' | 'DHE';
interface ConnectionOption {
  type: ConnectionType;
  label: string;
}

const dhcConnection: ConnectionOption = { type: 'DHC', label: 'DHC' };
const dheConnection: ConnectionOption = { type: 'DHE', label: 'DHE' };

const connectionOptions: ConnectionOption[] = [dhcConnection, dheConnection];

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  let dhcRunner: DhcRunner;
  let dheRunner: DheRunner;
  let selectedConnection!: ConnectionOption;
  let selectedRunner!: DhcRunner | DheRunner;

  // DHC
  const dhcServerUrl = 'http://localhost:10000';

  // DHE
  const dhePort = 8123;
  const dheVm = 'bmingles-vm-f1';
  const dheHost = `${dheVm}.int.illumon.com:${dhePort}`;
  const dheServerUrl = `https://${dheHost}`;
  const dheWsUrl = `wss://${dheHost}/socket`;

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    editor => {
      if (!selectedConnection) {
        setSelectedConnection(dhcConnection);
      }

      selectedRunner.runEditorCode(editor);
    }
  );

  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async editor => {
      if (!selectedConnection) {
        setSelectedConnection(dhcConnection);
      }

      selectedRunner.runEditorCode(editor, true);
    }
  );

  const selectionConnectionCmd = vscode.commands.registerCommand(
    SELECT_CONNECTION_COMMAND,
    async () => {
      const result = await createDHQuickPick(selectedConnection);
      if (!result) {
        return;
      }

      setSelectedConnection(result);
    }
  );

  const connectStatusBarItem = createConnectStatusBarItem();

  context.subscriptions.push(
    outputChannel,
    runCodeCmd,
    runSelectionCmd,
    selectionConnectionCmd,
    connectStatusBarItem
  );

  async function setSelectedConnection(option: ConnectionOption) {
    selectedConnection = option;
    connectStatusBarItem.text = getConnectText(option.type);

    selectedRunner =
      option.type === 'DHC'
        ? (dhcRunner = dhcRunner ?? new DhcRunner(dhcServerUrl, outputChannel))
        : (dheRunner =
            dheRunner ?? new DheRunner(dheServerUrl, outputChannel, dheWsUrl));

    if (selectedRunner.isInitialized) {
      vscode.window.showInformationMessage(
        `Connected to ${selectedConnection.type} server`
      );
    } else {
      await selectedRunner.initDh();
    }
  }
}

export function deactivate() {}

async function createDHQuickPick(selectedOption?: ConnectionOption) {
  // const qp = vscode.window.createQuickPick<ConnectionOption>();
  // qp.items = connectionOptions;

  // return new Promise<ConnectionOption>(resolve => {
  //   qp.onDidChangeSelection(([result]) => {
  //     if (!result) {
  //       return;
  //     }

  //     resolve(result);
  //   });

  //   qp.onDidHide(() => qp.dispose());
  //   qp.show();
  // });
  return await vscode.window.showQuickPick(
    connectionOptions.map(option => ({
      ...option,
      label: `${
        option.type === selectedOption?.type ? '$(circle-filled) ' : '      '
      } ${option.label}`,
    }))
  );
}

/** Create a status bar item for connecting to DH server */
function createConnectStatusBarItem() {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = SELECT_CONNECTION_COMMAND;
  statusBarItem.text = getConnectText('Deephaven');
  statusBarItem.show();

  return statusBarItem;
}

function getConnectText(connectionType: ConnectionType | 'Deephaven') {
  return `$(debug-disconnect) ${connectionType}`;
}
