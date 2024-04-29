import * as vscode from 'vscode';
import DhRunner from './DhRunner';
import {
  getAuthToken,
  getAuthenticatedDhcWorkerClient,
  initDheApi,
} from './dhe';
import { dh as DhcType } from './dhc-types';
import {
  EnterpriseDhType as DheType,
  CommandResult,
  IdeSession,
  DhcConnectionDetails,
  EnterpriseClient,
} from './dhe-types';
import { initDhcApi } from './dhc';
import { getPanelHtml } from '../util';

export class DheRunner extends DhRunner<
  DheType,
  DhcType.IdeSession,
  EnterpriseClient,
  CommandResult
> {
  constructor(
    serverUrl: string,
    outputChannel: vscode.OutputChannel,
    wsUrl: string
  ) {
    super(serverUrl, outputChannel);
    this.wsUrl = wsUrl;
  }

  private wsUrl: string;
  private worker: DhcConnectionDetails | null = null;
  // private workerUrl: string | null = null;

  protected initApi(): Promise<DheType> {
    return initDheApi(this.serverUrl);
  }

  protected async createClient(dhe: DheType): Promise<EnterpriseClient> {
    try {
      const client = new dhe.Client(this.wsUrl);

      await new Promise(resolve =>
        client.addEventListener(dhe.Client.EVENT_CONNECT, resolve)
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
  ): Promise<DhcType.IdeSession | null> {
    const username =
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

    if (username == null || token == null) {
      vscode.window.showErrorMessage('Username and password are required');
      return null;
    }

    const credentials = { username, token, type: 'password' };

    vscode.window.showInformationMessage('Creating Deephaven session');

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

    this.worker = await ide.startWorker(config);

    const { grpcUrl, ideUrl, jsApiUrl } = this.worker;

    console.log('Worker IDE URL:', ideUrl);
    console.log('JS API URL:', jsApiUrl);

    const dhc = await initDhcApi(new URL(jsApiUrl).origin);

    const dhcClient = await getAuthenticatedDhcWorkerClient(
      dheClient,
      dhc,
      grpcUrl,
      null
    );

    const cn = await dhcClient.getAsIdeConnection();

    const type = 'python';
    return cn.startSession(type);

    // const cn = await ide.createConsole(config);
    // const session = await cn.startSession('python');

    // return session;
  }

  protected runCode(text: string): Promise<CommandResult> {
    return this.session!.runCode(text);
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
}

export default DheRunner;
