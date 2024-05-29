import * as vscode from 'vscode';
import DhService from './DhService';
import {
  buildFsMap,
  getAuthToken,
  getAuthenticatedDhcWorkerClient,
  getWebClientData,
  getWorkspaceRowById,
  getWsUrl,
  initDheApi,
} from '../dh/dhe';
import { dh as DhcType } from '../dh/dhc-types';
import {
  EnterpriseDhType as DheType,
  CommandResult,
  DhcConnectionDetails,
  EnterpriseClient,
  QueryInfo,
  DeserializedRowData,
} from '../dh/dhe-types';
import { initDhcApi } from '../dh/dhc';
import { getPanelHtml } from '../util';
import { WebClientDataFsMap } from '../dh/dhe-fs-types';
import { ConnectionAndSession } from '../common';

export class DheService extends DhService<DheType, EnterpriseClient> {
  constructor(serverUrl: string, outputChannel: vscode.OutputChannel) {
    super(serverUrl, outputChannel);
    this.wsUrl = getWsUrl(serverUrl);
  }

  private username?: string;
  private wsUrl: string;
  private worker: DhcConnectionDetails | null = null;
  // private workerUrl: string | null = null;

  public getUsername(): string | undefined {
    return this.username;
  }

  protected initApi(): Promise<DheType> {
    return initDheApi(this.serverUrl);
  }

  protected async createClient(dhe: DheType): Promise<EnterpriseClient> {
    try {
      const client = new dhe.Client(this.wsUrl);

      await new Promise(resolve =>
        this.subscriptions.push(
          client.addEventListener(dhe.Client.EVENT_CONNECT, resolve)
        )
      );

      return client;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  protected async createSession(
    dhe: DheType,
    dheClient: EnterpriseClient
  ): Promise<ConnectionAndSession<
    DhcType.IdeConnection,
    DhcType.IdeSession
  > | null> {
    this.username =
      process.env.DH_IN_VSCODE_DHE_USERNAME ??
      (await vscode.window.showInputBox({
        prompt: 'Username',
        ignoreFocusOut: true,
      }));

    const token =
      process.env.DH_IN_VSCODE_DHE_PASSWORD ??
      (await vscode.window.showInputBox({
        prompt: 'Password',
        ignoreFocusOut: true,
        password: true,
      }));

    if (this.username == null || token == null) {
      vscode.window.showErrorMessage('Username and password are required');
      return null;
    }

    const credentials = { username: this.username, token, type: 'password' };

    vscode.window.showInformationMessage(
      `Creating Deephaven session: ${this.serverUrl}`
    );

    await dheClient.login(credentials);

    const ide = new dhe.Ide(dheClient);

    const engine = 'DeephavenCommunity';

    const config = new dhe.ConsoleConfig();
    config.jvmArgs = ['-Dhttp.websockets=true'];
    config.workerKind = 'DeephavenCommunity';
    config.workerCreationJson = JSON.stringify({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      script_language: 'python',
      // kubernetes_worker_control: kubernetesWorkerControl,
    });

    this.outputChannel.appendLine('Starting DHC worker...');
    this.worker = await ide.startWorker(config);

    const { grpcUrl, ideUrl, jsApiUrl } = this.worker;
    this.outputChannel.appendLine(`Started DHC worker: ${ideUrl}`);

    console.log('Worker IDE URL:', ideUrl);
    console.log('JS API URL:', jsApiUrl);

    this.outputChannel.appendLine(
      `Initializing DHC Worker API...: ${jsApiUrl}`
    );
    const dhc = await initDhcApi(new URL(jsApiUrl).origin);

    this.outputChannel.appendLine(`Initialized DHC Worker API: ${jsApiUrl}`);

    const dhcClient = await getAuthenticatedDhcWorkerClient(
      dheClient,
      dhc,
      grpcUrl,
      null
    );

    const cn = await dhcClient.getAsIdeConnection();

    const type = 'python';
    const session = await cn.startSession(type);

    return { cn, session };
  }

  protected getPanelHtml(title: string): string {
    if (this.worker == null) {
      return '';
    }

    const workerUrl = new URL(this.worker.ideUrl);
    workerUrl.pathname = '/iframe/widget';
    workerUrl.searchParams.set('name', title);
    workerUrl.searchParams.set('authProvider', 'parent');

    return getPanelHtml(workerUrl.toString(), title);
  }

  protected async handlePanelMessage(
    {
      id,
      message,
    }: {
      id: string;
      message: string;
    },
    postResponseMessage: (response: unknown) => void
  ): Promise<void> {
    console.log('Received panel message:', message, this.worker);

    if (this.client == null || this.worker == null) {
      return;
    }

    if (message === 'io.deephaven.message.LoginOptions.request') {
      const authToken = await getAuthToken(this.client);

      const response = {
        message: 'vscode-ext.loginOptions',
        payload: {
          id,
          payload: authToken,
        },
        targetOrigin: this.worker.ideUrl,
      };

      console.log('Posting LoginOptions response:', response);

      postResponseMessage(response);

      return;
    }

    if (message === 'io.deephaven.message.SessionDetails.request') {
      const response = {
        message: 'vscode-ext.sessionDetails',
        payload: {
          id,
          payload: {
            workerName: this.worker.workerName,
            processInfoId: this.worker.processInfoId,
          },
        },
        targetOrigin: this.worker.ideUrl,
      };

      console.log('Posting SessionDetails response:', response);

      postResponseMessage(response);

      return;
    }

    console.log('Unknown message type', message);
  }

  public buildFsMap = async (): Promise<WebClientDataFsMap> => {
    if (this.dh == null || this.client == null) {
      await this.initDh();
    }

    return buildFsMap(this.dh!, this.client!);
  };

  public async getWebClientData(): Promise<QueryInfo> {
    if (this.dh == null || this.client == null) {
      throw new Error('Deephaven API not initialized');
    }

    return getWebClientData(this.dh, this.client);
  }

  public async getWorkspaceRowById<T = DeserializedRowData>(
    webClientData: QueryInfo,
    id: string
  ): Promise<T | null> {
    if (this.dh == null) {
      throw new Error('Deephaven API not initialized');
    }

    return getWorkspaceRowById(this.dh, webClientData, id) as T;
  }
}

export default DheService;
