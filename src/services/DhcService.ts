import * as vscode from 'vscode';
import type { dh as DhType } from '../dh/dhc-types';
import DhService from './DhService';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  getEmbedWidgetUrl,
  initDhcApi,
  initDhcSession,
} from '../dh/dhc';
import { getPanelHtml } from '../util';

export class DhcService extends DhService<
  typeof DhType,
  DhType.IdeSession,
  DhType.CoreClient,
  DhType.ide.CommandResult
> {
  private psk?: string;

  protected async initApi() {
    return initDhcApi(this.serverUrl);
  }

  protected async createClient(dh: typeof DhType): Promise<DhType.CoreClient> {
    try {
      return new dh.CoreClient(this.serverUrl);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  protected async createSession(dh: typeof DhType, client: DhType.CoreClient) {
    let ide: DhType.IdeSession | null = null;

    try {
      const authConfig = new Set(
        (await client.getAuthConfigValues()).map(([, value]) => value)
      );

      if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
        ide = await initDhcSession(client, {
          type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
        });
      } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
        const token = await vscode.window.showInputBox({
          placeHolder: 'Pre-Shared Key',
          prompt: 'Enter your Deephaven pre-shared key',
          password: true,
        });

        ide = await initDhcSession(client, {
          type: 'io.deephaven.authentication.psk.PskAuthenticationHandler',
          token,
        });

        this.psk = token;
      }
    } catch (err) {
      console.error(err);
    }

    return ide;
  }

  protected async runCode(text: string): Promise<DhType.ide.CommandResult> {
    return this.session!.runCode(text);
  }

  protected getPanelHtml(title: string): string {
    const iframeUrl = getEmbedWidgetUrl(this.serverUrl, title, this.psk);
    return getPanelHtml(iframeUrl, title);
  }

  protected handlePanelMessage(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export default DhcService;
