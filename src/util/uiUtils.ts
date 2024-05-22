import * as vscode from 'vscode';
import { ConnectionType, SELECT_CONNECTION_COMMAND } from '../common';
import { Config } from '../services';
import { serverUrlToFsRootUri } from './urlUtils';

export interface ConnectionOption {
  type: ConnectionType;
  label: string;
  url: string;
}

export interface WorkspaceFolderConfig {
  readonly uri: vscode.Uri;
  readonly name?: string;
}

/**
 * Create quickpick for selecting a connection.
 * @param connectionOptions
 * @param selectedUrl
 */
export async function createConnectionQuickPick(
  connectionOptions: ConnectionOption[],
  selectedUrl?: string | null
): Promise<ConnectionOption | { label: string; url: null } | undefined> {
  function padLabel(label: string, isSelected: boolean) {
    return isSelected ? `$(circle-filled) ${label}` : `      ${label}`;
  }

  const options = [
    {
      label: padLabel(
        selectedUrl == null ? 'Disconnected' : 'Disconnect',
        selectedUrl == null
      ),
      url: null,
    },
    ...connectionOptions.map(option => ({
      ...option,
      label: padLabel(option.label, option.url === selectedUrl),
    })),
  ];

  return await vscode.window.showQuickPick(options);
}

/**
 * Create a status bar item for connecting to DH server
 */
export function createConnectStatusBarItem() {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = SELECT_CONNECTION_COMMAND;
  statusBarItem.text = createConnectText('Deephaven: Disconnected');
  statusBarItem.show();

  return statusBarItem;
}

/**
 * Create an option for the connection selection picker.
 * @param type The type of connection
 */
export function createConnectionOption(type: ConnectionType) {
  return (serverUrl: string) => {
    const url = new URL(serverUrl ?? '');
    const label = `${type}: ${url.hostname}:${url.port}`;

    return { type, label, url: serverUrl };
  };
}

/**
 * Create connection options from current extension config.
 */
export function createConnectionOptions(): ConnectionOption[] {
  const dhcServerUrls = Config.getCoreServers();
  const dheServerUrls = Config.getEnterpriseServers();

  const connectionOptions: ConnectionOption[] = [
    ...dhcServerUrls.map(createConnectionOption('DHC')),
    ...dheServerUrls.map(createConnectionOption('DHE')),
  ];

  return connectionOptions;
}

/**
 * Create display text for the connection status bar item.
 * @param connectionDisplay The connection display text
 */
export function createConnectText(connectionDisplay: string | 'Deephaven') {
  return `$(debug-disconnect) ${connectionDisplay.trim()}`;
}

/**
 * Create config for dhfs workspace folder.
 * @param type
 * @param serverUrl
 */
export function createDhfsWorkspaceFolderConfig(
  type: ConnectionType,
  serverUrl: string
): WorkspaceFolderConfig {
  const url = new URL(serverUrl);
  const uri = serverUrlToFsRootUri(url);

  return {
    uri,
    name: `${type}: ${url.hostname}`,
  };
}

/**
 * See if a workspace folder is present for the given uri.
 * @param uri
 * @returns
 */
export function isWorkspaceFolderPresent(wsUri: vscode.Uri) {
  return vscode.workspace.workspaceFolders?.some(
    ({ uri }) => uri.toString() === wsUri.toString()
  );
}
