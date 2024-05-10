import * as vscode from 'vscode';
import {
  ConnectionOption,
  createConnectStatusBarItem,
  createConnectText,
  createConnectionOption,
  createConnectionQuickPick,
  createDhfsWorkspaceFolderConfig,
  getTempDir,
} from './util';
import { DhcService, DheService } from './services';
import { WebClientDataFsProvider } from './fs/WebClientDataFsProvider';
import { DhServiceRegistry } from './services';
import {
  DHFS_SCHEME,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECTED_CONNECTION_STORAGE_KEY,
  SELECT_CONNECTION_COMMAND,
} from './common';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "dh-in-vscode" is now active!');

  let selectedConnectionUrl: string | null = null;
  let selectedDhService: DhcService | DheService | null = null;

  const config = vscode.workspace.getConfiguration('dh-in-vscode');

  const dhcServerUrls = config.get<string[]>('core-servers') ?? [];
  const dheServerUrls = config.get<string[]>('enterprise-servers') ?? [];

  const connectionOptions: ConnectionOption[] = [
    ...dhcServerUrls.map(createConnectionOption('DHC')),
    ...dheServerUrls.map(createConnectionOption('DHE')),
  ];

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
  outputChannel.show();
  outputChannel.appendLine('Deephaven extension activated');

  const dhcServiceRegistry = new DhServiceRegistry(DhcService, outputChannel);
  const dheServiceRegistry = new DhServiceRegistry(DheService, outputChannel);

  // Register file system provider for DHE servers
  if (dheServerUrls.length > 0) {
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
    connectionOptions,
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
      onConnectionSelected(url);
      context.globalState.update(SELECTED_CONNECTION_STORAGE_KEY, null);
    }
  }

  /**
   * Handle connection selection
   */
  async function onConnectionSelected(connectionUrl: string) {
    outputChannel.appendLine(`Selecting connection: ${connectionUrl}`);

    const option = connectionOptions.find(
      option => option.url === connectionUrl
    );

    if (!option) {
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
        if (
          !vscode.workspace.workspaceFolders?.some(
            ({ uri }) => uri.toString() === wsFolderConfig.uri.toString()
          )
        ) {
          outputChannel.appendLine(
            `Adding folder to workspace: ${selectedConnectionUrl}`
          );

          // Store our selected connection so we can use it when extension re-activates
          storeConnectionUrl();

          const i = vscode.workspace.workspaceFolders?.length ?? 0;
          vscode.workspace.updateWorkspaceFolders(i, 0, wsFolderConfig);
        }
      }
    }
  }
}

export function deactivate() {}

/** Register commands for the extension. */
function registerCommands(
  connectionOptions: ConnectionOption[],
  getActiveDhService: (
    autoActivate: boolean
  ) => Promise<DhcService | DheService | null>,
  onConnectionSelected: (connectionUrl: string) => void
) {
  /** Run all code in active editor */
  const runCodeCmd = vscode.commands.registerTextEditorCommand(
    RUN_CODE_COMMAND,
    async editor => {
      const dhService = await getActiveDhService(true);
      dhService?.runEditorCode(editor);
    }
  );

  /** Run selected code in active editor */
  const runSelectionCmd = vscode.commands.registerTextEditorCommand(
    RUN_SELECTION_COMMAND,
    async editor => {
      const dhService = await getActiveDhService(true);
      dhService?.runEditorCode(editor, true);
    }
  );

  /** Select connection to run scripts against */
  const selectConnectionCmd = vscode.commands.registerCommand(
    SELECT_CONNECTION_COMMAND,
    async () => {
      const dhService = await getActiveDhService(false);

      const result = await createConnectionQuickPick(
        connectionOptions,
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
