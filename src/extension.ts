// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getTempDir } from './util';
import { CacheService, DhcService, DheService } from './services';
import { WebClientDataFsProvider } from './fs/WebClientDataFsProvider';
import { DhServiceRegistry } from './services';

// const CONNECT_COMMAND = "dh-in-vscode.connect";
const RUN_CODE_COMMAND = 'dh-in-vscode.runCode';
const RUN_SELECTION_COMMAND = 'dh-in-vscode.runSelection';
const SELECT_CONNECTION_COMMAND = 'dh-in-vscode.selectConnection';
const SELECTED_CONNECTION_STORAGE_KEY = 'selectedConnection';

type ConnectionType = 'DHC' | 'DHE';
interface ConnectionOption {
  type: ConnectionType;
  label: string;
  url: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  let selectedConnectionUrl: string;
  let selectedDhService!: DhcService | DheService;

  const config = vscode.workspace.getConfiguration('dh-in-vscode');

  const dhcServerUrls = config.get<string[]>('core-servers') ?? [];
  const dheServerUrls = config.get<string[]>('enterprise-servers') ?? [];

  const connectionOptions: ConnectionOption[] = [
    ...dhcServerUrls.map(createOption('DHC')),
    ...dheServerUrls.map(createOption('DHE')),
  ];

  const defaultConnection = connectionOptions[0];

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
  outputChannel.appendLine('Deephaven extension activated');
  outputChannel.show();

  const dhcServiceRegistry = new DhServiceRegistry(DhcService, outputChannel);
  const dheServiceRegistry = new DhServiceRegistry(DheService, outputChannel);

  if (dheServerUrls.length > 0) {
    const webClientDataFs = new WebClientDataFsProvider(dheServiceRegistry);

    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider('dhfs', webClientDataFs, {
        isCaseSensitive: true,
      })
    );
  }

  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    async editor => {
      if (!selectedConnectionUrl) {
        await setSelectedConnection(defaultConnection.url);
      }

      selectedDhService.runEditorCode(editor);
    }
  );

  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async editor => {
      if (!selectedConnectionUrl) {
        await setSelectedConnection(defaultConnection.url);
      }

      selectedDhService.runEditorCode(editor, true);
    }
  );

  const selectionConnectionCmd = vscode.commands.registerCommand(
    SELECT_CONNECTION_COMMAND,
    async () => {
      const result = await createDHQuickPick(
        connectionOptions,
        selectedConnectionUrl
      );
      if (!result) {
        return;
      }

      setSelectedConnection(result.url);
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

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  // If we have a stored connection, restore it
  restoreConnection();

  // Store connection url so we can restore it when extension re-activates.
  // This is useful for DHE workspace folders that cause a re-activation when
  // added to the workspace.
  function storeConnectionUrl() {
    context.globalState.update(
      SELECTED_CONNECTION_STORAGE_KEY,
      selectedConnectionUrl
    );
  }

  // Restore connection if we have one stored
  function restoreConnection() {
    const url = context.globalState.get<string>(
      SELECTED_CONNECTION_STORAGE_KEY
    );
    if (url) {
      setSelectedConnection(url);
      context.globalState.update(SELECTED_CONNECTION_STORAGE_KEY, null);
    }
  }

  async function setSelectedConnection(connectionUrl: string) {
    outputChannel.appendLine(`Selecting connection: ${connectionUrl}`);

    const option = connectionOptions.find(
      option => option.url === connectionUrl
    );

    if (!option) {
      return;
    }

    selectedConnectionUrl = connectionUrl;

    connectStatusBarItem.text = getConnectText(option.label);

    selectedDhService =
      option.type === 'DHC'
        ? await dhcServiceRegistry.get(selectedConnectionUrl)
        : await dheServiceRegistry.get(selectedConnectionUrl);

    if (selectedDhService.isInitialized) {
      vscode.window.showInformationMessage(
        `Connected to ${selectedConnectionUrl}`
      );
    } else {
      if (option.type === 'DHC') {
        await selectedDhService.initDh();
      } else {
        const dheUrl = new URL(selectedConnectionUrl);
        const dheUri = vscode.Uri.parse(
          `dhfs:/${dheUrl.protocol}${dheUrl.hostname}:${dheUrl.port}`
        );

        // If we don't already have a workspace folder for this connection, add
        // one. Note that this will cause extension to re-activate which means we
        // lose any state, so don't bother calling `initDh()` here. It will get
        // called lazily after extension is re-activated and the dhfs starts
        // building its tree.
        if (
          !vscode.workspace.workspaceFolders?.some(
            ({ uri }) => uri.toString() === dheUri.toString()
          )
        ) {
          // Store our selected connection so we can use it when extension re-activates
          storeConnectionUrl();

          vscode.workspace.updateWorkspaceFolders(0, 0, {
            uri: dheUri,
            name: `DHE: ${dheUrl.hostname}`,
          });
        }
      }
    }
  }
}

export function deactivate() {}

async function createDHQuickPick(
  connectionOptions: ConnectionOption[],
  selectedUrl?: string
) {
  return await vscode.window.showQuickPick(
    connectionOptions.map(option => ({
      ...option,
      label: `${option.url === selectedUrl ? '$(circle-filled) ' : '      '} ${
        option.label
      }`,
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
  statusBarItem.text = getConnectText('Deephaven: Disconnected');
  statusBarItem.show();

  return statusBarItem;
}

function createOption(type: ConnectionType) {
  return (url: string) => ({ type, label: `${type}: ${url}`, url });
}

function getConnectText(connectionDisplay: string | 'Deephaven') {
  return `$(debug-disconnect) ${connectionDisplay.trim()}`;
}
