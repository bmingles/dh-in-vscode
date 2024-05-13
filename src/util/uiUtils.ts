import * as vscode from 'vscode';
import {
  ConnectionType,
  DHFS_SCHEME,
  SELECT_CONNECTION_COMMAND,
} from '../common';

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
  const uri = vscode.Uri.parse(
    `${DHFS_SCHEME}:/${url.protocol}${url.hostname}:${url.port}`
  );

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
