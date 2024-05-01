// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getTempDir } from './util';
import { DhcService, DheService, WebClientDataFsService } from './services';
import { WebClientDataFsProvider } from './fs/WebClientDataFsProvider';

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

  let dhcService: DhcService;
  let dheService: DheService;
  let selectedConnection!: ConnectionOption;
  let selectedDhService!: DhcService | DheService;

  // DHC
  const dhcServerUrl = 'http://localhost:10000';

  // DHE
  const dhePort = 8123;
  const dheVm = 'bmingles-vm-f1';
  const dheHost = `${dheVm}.int.illumon.com:${dhePort}`;
  const dheServerUrl = `https://${dheHost}`;
  const dheWsUrl = `wss://${dheHost}/socket`;

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
  outputChannel.appendLine('Deephaven extension activated');
  outputChannel.show();

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  // TBD: Can this be initialized when DHE is connected?
  if (dheServerUrl) {
    dheService = new DheService(dheServerUrl, outputChannel, dheWsUrl);
    const fsService = new WebClientDataFsService(dheService.buildFsMap);
    const webClientDataFs = new WebClientDataFsProvider(dheService, fsService);

    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider('dhfs', webClientDataFs, {
        isCaseSensitive: true,
      })
    );
  }

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    editor => {
      if (!selectedConnection) {
        setSelectedConnection(dhcConnection);
      }

      selectedDhService.runEditorCode(editor);
    }
  );

  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async editor => {
      if (!selectedConnection) {
        setSelectedConnection(dhcConnection);
      }

      selectedDhService.runEditorCode(editor, true);
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

    selectedDhService =
      option.type === 'DHC'
        ? (dhcService =
            dhcService ?? new DhcService(dhcServerUrl, outputChannel))
        : (dheService =
            dheService ??
            new DheService(dheServerUrl, outputChannel, dheWsUrl));

    if (selectedDhService.isInitialized) {
      vscode.window.showInformationMessage(
        `Connected to ${selectedConnection.type} server`
      );
    } else {
      if (option.type === 'DHC') {
        await selectedDhService.initDh();
      } else {
        // if (
        //   vscode.workspace.workspaceFolders?.[0].uri.toString() !==
        //   vscode.Uri.parse('dhfs:/').toString()
        // ) {
        // Note that this will cause extension to re-activate which means we
        // lose any state, so don't bother calling `initDh()` here. It will get
        // called lazily after extension is re-activated and the dhfs starts
        // building its tree.
        vscode.workspace.updateWorkspaceFolders(0, 0, {
          uri: vscode.Uri.parse('dhfs:/'),
          name: 'Deephaven',
        });
        // }
      }
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
