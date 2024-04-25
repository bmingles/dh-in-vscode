import * as vscode from 'vscode';
import DhRunner from './DhRunner';
import { initDheApi } from './dhe';
import {
  EnterpriseDhType as DheType,
  CommandResult,
  IdeSession,
} from './dhe-types';

export class DheRunner extends DhRunner<DheType, IdeSession, CommandResult> {
  constructor(
    serverUrl: string,
    outputChannel: vscode.OutputChannel,
    wsUrl: string
  ) {
    super(serverUrl, outputChannel);
    this.wsUrl = wsUrl;
  }

  private wsUrl: string;

  protected initApi(): Promise<DheType> {
    return initDheApi(this.serverUrl);
  }

  protected async createSession(dh: DheType): Promise<IdeSession | null> {
    /* @ts-ignore */
    global.window.location = new URL(this.serverUrl);

    const client = new dh.Client(this.wsUrl);

    await new Promise(resolve =>
      // @ts-ignore
      client.addEventListener(dh.Client.EVENT_CONNECT, resolve)
    );

    const username = await vscode.window.showInputBox({ prompt: 'Username' });
    const token = await vscode.window.showInputBox({
      prompt: 'Password',
      password: true,
    });

    if (username == null || token == null) {
      vscode.window.showErrorMessage('Username and password are required');
      return null;
    }

    const credentials = { username, token, type: 'password' };

    vscode.window.showInformationMessage('Creating Deephaven session');

    await client.login(credentials);

    const ide = new dh.Ide(client);

    const cn = await ide.createConsole(new dh.ConsoleConfig());
    const session = await cn.startSession('python');

    return session;
  }

  protected runCode(text: string): Promise<CommandResult> {
    return this.session!.runCode(text);
  }
  protected getPanelHtml(title: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deephaven</title>
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
        <iframe title="${title}">Not Implemented</iframe>
    </body>
    </html>`;
  }
}

export default DheRunner;
