import * as vscode from 'vscode';
import DhRunner from './DhRunner';
import { getAuthenticatedDhcWorkerClient, initDheApi } from './dhe';
import { dh as DhcType } from './dhc-types';
import {
  EnterpriseDhType as DheType,
  CommandResult,
  IdeSession,
} from './dhe-types';
import { initDhcApi } from './dhc';
import { getPanelHtml } from '../util';

export class DheRunner extends DhRunner<
  DheType,
  DhcType.IdeSession,
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
  private workerUrl: string | null = null;

  protected initApi(): Promise<DheType> {
    return initDheApi(this.serverUrl);
  }

  protected async createSession(
    dhe: DheType
  ): Promise<DhcType.IdeSession | null> {
    const dheClient = new dhe.Client(this.wsUrl);

    await new Promise(resolve =>
      // @ts-ignore
      dheClient.addEventListener(dhe.Client.EVENT_CONNECT, resolve)
    );

    const username =
      process.env.DH_IN_VSCODE_DHE_USERNAME ??
      (await vscode.window.showInputBox({ prompt: 'Username' }));

    const token =
      process.env.DH_IN_VSCODE_DHE_PASSWORD ??
      (await vscode.window.showInputBox({
      prompt: 'Password',
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

    const worker = await ide.startWorker(config);
    const { grpcUrl, ideUrl, jsApiUrl } = worker;

    const workerUrl = new URL(ideUrl);
    workerUrl.searchParams.set('authProvider', 'parent');
    this.workerUrl = workerUrl.toString();

    console.log('Worker URL', this.workerUrl);
    console.log('JS API URL', jsApiUrl);

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
    if (this.workerUrl == null) {
      return '';
    }

    return getPanelHtml(this.workerUrl, title);
  }
}

export default DheRunner;
