import * as vscode from 'vscode';
import {
  ConnectionOption,
  createConnectStatusBarItem,
  createConnectText,
  createConnectionOption,
  createConnectionOptions,
  createConnectionQuickPick,
  createDhfsWorkspaceFolderConfig,
  getTempDir,
  isWorkspaceFolderPresent,
} from './util';
import { Config, DhcService, DheService } from './services';
import { WebClientDataFsProvider } from './fs/WebClientDataFsProvider';
import { DhServiceRegistry } from './services';
import {
  DHFS_SCHEME,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  WS_FOLDER_CONNECTION_URL,
  SELECT_CONNECTION_COMMAND,
} from './common';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  let selectedConnectionUrl: string | null = null;
  let selectedDhService: DhcService | DheService | null = null;
  let connectionOptions = createConnectionOptions();

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
  outputChannel.appendLine('Deephaven extension activated');

  // Update connection options when configuration changes
  vscode.workspace.onDidChangeConfiguration(
    () => {
      outputChannel.appendLine('Configuration changed');
      connectionOptions = createConnectionOptions();
    },
    null,
    context.subscriptions
  );

  const dhcServiceRegistry = new DhServiceRegistry(DhcService, outputChannel);
  const dheServiceRegistry = new DhServiceRegistry(DheService, outputChannel);

  // Register file system provider for DHE servers
  if (Config.hasEnterpriseServers()) {
    const webClientDataFs = new WebClientDataFsProvider(dheServiceRegistry);

    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider(
        DHFS_SCHEME,
        webClientDataFs,
        {
          isCaseSensitive: true,
        }
      )
    );
  }

  /**
   * Get currently active DH service.
   * @autoActivate If true, auto-activate a service if none is active.
   */
  async function getActiveDhService(
    autoActivate: boolean
  ): Promise<DhcService | DheService | null> {
    if (autoActivate && !selectedConnectionUrl) {
      const defaultConnection = connectionOptions[0];
      await onConnectionSelected(defaultConnection.url);
    }

    return selectedDhService;
  }

  /** Register extension commands */
  const { runCodeCmd, runSelectionCmd, selectConnectionCmd } = registerCommands(
    () => connectionOptions,
    getActiveDhService,
    onConnectionSelected
  );

  const connectStatusBarItem = createConnectStatusBarItem();

  context.subscriptions.push(
    outputChannel,
    runCodeCmd,
    runSelectionCmd,
    selectConnectionCmd,
    connectStatusBarItem
  );

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  // If we have a stored connection for a ws folder being added, restore it
  restoreWsFolderConnection();

  // Store connection url so we can restore it when extension re-activates.
  // This is useful for DHE workspace folders that cause a re-activation when
  // added to the workspace.
  function storeWsFolderConnectionUrl(wsFolderConnectionUrl: string) {
    context.globalState.update(WS_FOLDER_CONNECTION_URL, wsFolderConnectionUrl);
  }

  // Restore connection if we have one stored
  function restoreWsFolderConnection() {
    const url = context.globalState.get<string>(WS_FOLDER_CONNECTION_URL);

    // If we have a stored url and the ws folder exists in the workspace, this
    // means the extension was re-activated because the ws folder was added, so
    // reconnect
    if (
      url &&
      isWorkspaceFolderPresent(createDhfsWorkspaceFolderConfig('DHE', url).uri)
    ) {
      outputChannel.appendLine(`Restoring connection: ${url}`);
      onConnectionSelected(url);
    }
  }

  /**
   * Handle connection selection
   */
  async function onConnectionSelected(connectionUrl: string | null) {
    // Show the output panel whenever we select a connection. This is a little
    // friendlier to the user instead of it opening when the extension activates
    // for cases where the user isn't working with DH server
    outputChannel.show();

    outputChannel.appendLine(
      connectionUrl == null
        ? 'Disconnecting'
        : `Selecting connection: ${connectionUrl}`
    );

    // Clear any previously stored connection
    context.globalState.update(WS_FOLDER_CONNECTION_URL, null);

    const option = connectionOptions.find(
      option => option.url === connectionUrl
    );

    // Disconnect option was selected, or connectionUrl that no longer exists
    if (connectionUrl == null || !option) {
      selectedConnectionUrl = null;
      selectedDhService = null;
      connectStatusBarItem.text = createConnectText('Disconnected');
      dhcServiceRegistry.clearCache();
      dheServiceRegistry.clearCache();
      return;
    }

    selectedConnectionUrl = connectionUrl;

    connectStatusBarItem.text = createConnectText(option.label);

    selectedDhService =
      option.type === 'DHC'
        ? await dhcServiceRegistry.get(selectedConnectionUrl)
        : await dheServiceRegistry.get(selectedConnectionUrl);

    if (selectedDhService.isInitialized) {
      outputChannel.appendLine(`Initialized: ${selectedConnectionUrl}`);
    } else {
      if (option.type === 'DHC') {
        await selectedDhService.initDh();
        outputChannel.appendLine(`Initialized: ${selectedConnectionUrl}`);
      } else {
        const wsFolderConfig = createDhfsWorkspaceFolderConfig(
          option.type,
          selectedConnectionUrl
        );

        // If we don't already have a workspace folder for this connection, add
        // one. Note that this will cause extension to re-activate which means we
        // lose any state, so don't bother calling `initDh()` here. It will get
        // called lazily after extension is re-activated and the dhfs starts
        // building its tree.
        if (!isWorkspaceFolderPresent(wsFolderConfig.uri)) {
          outputChannel.appendLine(
            `Adding folder to workspace: ${selectedConnectionUrl}`
          );

          // Store our selected connection so we can use it when extension re-activates
          storeWsFolderConnectionUrl(selectedConnectionUrl);

          const i = vscode.workspace.workspaceFolders?.length ?? 0;
          vscode.workspace.updateWorkspaceFolders(i, 0, wsFolderConfig);
        }
      }
    }
  }
}

export function deactivate() {}

async function ensureUriEditorIsActive(uri: vscode.Uri) {
  const isActive =
    uri.toString() === vscode.window.activeTextEditor?.document.uri.toString();

  // If another panel such as the output panel is active, set the document
  // for the url to active first
  if (!isActive) {
    // https://stackoverflow.com/a/64808497/20489
    await vscode.window.showTextDocument(uri, { preview: false });
  }
}

/** Register commands for the extension. */
function registerCommands(
  getConnectionOptions: () => ConnectionOption[],
  getActiveDhService: (
    autoActivate: boolean
  ) => Promise<DhcService | DheService | null>,
  onConnectionSelected: (connectionUrl: string | null) => void
) {
  /** Run all code in active editor */
  const runCodeCmd = vscode.commands.registerCommand(
    RUN_CODE_COMMAND,
    async (uri: vscode.Uri, _arg: { groupId: number }) => {
      await ensureUriEditorIsActive(uri);

      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const dhService = await getActiveDhService(true);
        dhService?.runEditorCode(editor);
      }
    }
  );

  /** Run selected code in active editor */
  const runSelectionCmd = vscode.commands.registerCommand(
    RUN_SELECTION_COMMAND,
    async (uri: vscode.Uri, _arg: { groupId: number }) => {
      await ensureUriEditorIsActive(uri);

      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const dhService = await getActiveDhService(true);
        dhService?.runEditorCode(editor, true);
      }
    }
  );

  /** Select connection to run scripts against */
  const selectConnectionCmd = vscode.commands.registerCommand(
    SELECT_CONNECTION_COMMAND,
    async () => {
      const dhService = await getActiveDhService(false);

      const result = await createConnectionQuickPick(
        getConnectionOptions(),
        dhService?.serverUrl
      );
      if (!result) {
        return;
      }

      onConnectionSelected(result.url);
    }
  );

  return { runCodeCmd, runSelectionCmd, selectConnectionCmd };
}
