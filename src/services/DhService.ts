import * as vscode from 'vscode';
import type { dh as DhType } from '../dh/dhc-types';

/* eslint-disable @typescript-eslint/naming-convention */
const icons = {
  Figure: '📈',
  'deephaven.plot.express.DeephavenFigure': '📈',
  Table: '⬜',
  'deephaven.ui.Element': '✨',
} as const;
type IconType = keyof typeof icons;
/* eslint-enable @typescript-eslint/naming-convention */

// Common command result types shared by DHC and DHE
type ChangesBase = {
  removed: Partial<DhType.ide.VariableDefinition>[];
  created: Partial<DhType.ide.VariableDefinition>[];
  updated: Partial<DhType.ide.VariableDefinition>[];
};
type CommandResultBase = {
  changes: ChangesBase;
  error: string;
};

export abstract class DhService<
  TDH,
  TSession,
  TClient,
  TCommandResult extends CommandResultBase
> {
  constructor(serverUrl: string, outputChannel: vscode.OutputChannel) {
    this.serverUrl = serverUrl;
    this.outputChannel = outputChannel;
  }

  protected outputChannel: vscode.OutputChannel;
  private panels = new Map<string, vscode.WebviewPanel>();
  private cachedCreateClient: Promise<TClient> | null = null;
  private cachedCreateSession: Promise<TSession | null> | null = null;
  private cachedInitApi: Promise<TDH> | null = null;

  protected dh: TDH | null = null;
  protected client: TClient | null = null;
  protected serverUrl: string;
  protected session: TSession | null = null;

  protected abstract initApi(): Promise<TDH>;
  protected abstract createClient(dh: TDH): Promise<TClient>;
  protected abstract createSession(
    dh: TDH,
    client: TClient
  ): Promise<TSession | null>;
  protected abstract runCode(text: string): Promise<TCommandResult>;
  protected abstract getPanelHtml(title: string): string;
  protected abstract handlePanelMessage(
    message: {
      id: string;
      message: string;
    },
    postResponseMessage: (response: unknown) => void
  ): Promise<void>;

  public get isInitialized(): boolean {
    return this.cachedInitApi != null;
  }

  public async initDh() {
    try {
      if (this.cachedInitApi == null) {
        vscode.window.showInformationMessage('Initializing Deephaven API');
        this.cachedInitApi = this.initApi();
      }
      this.dh = await this.cachedInitApi;
    } catch (err) {
      console.error(err);
      this.outputChannel.appendLine(
        `Failed to initialize Deephaven API: ${err}`
      );
      vscode.window.showErrorMessage('Failed to initialize Deephaven API');
      return;
    }

    if (this.cachedCreateClient == null) {
      this.outputChannel.appendLine('Creating client.');
      this.cachedCreateClient = this.createClient(this.dh);
    }
    this.client = await this.cachedCreateClient;

    if (this.cachedCreateSession == null) {
      this.outputChannel.appendLine('Creating session.');
      this.cachedCreateSession = this.createSession(this.dh, this.client);
    }
    this.session = await this.cachedCreateSession;

    if (this.session == null) {
      vscode.window.showErrorMessage('Failed to connect to Deephaven server');
    } else {
      vscode.window.showInformationMessage('Connected to Deephaven server');
    }
  }

  public async runEditorCode(
    editor: vscode.TextEditor,
    selectionOnly = false
  ): Promise<void> {
    if (editor.document.languageId !== 'python') {
      // This should not actually happen
      console.log(`languageId '${editor.document.languageId}' not supported.`);
      return;
    }

    this.outputChannel.appendLine(`Sending code to: ${this.serverUrl}`);

    if (this.session == null) {
      await this.initDh();
    }

    if (this.session == null) {
      return;
    }

    const selectionRange =
      selectionOnly && editor.selection?.isEmpty === false
        ? new vscode.Range(
            editor.selection.start.line,
            editor.selection.start.character,
            editor.selection.end.line,
            editor.selection.end.character
          )
        : undefined;

    const text = editor.document.getText(selectionRange);

    console.log('Sending text to dh:', text);

    const result = await this.runCode(text);

    if (result.error) {
      console.error(result.error);
      this.outputChannel.appendLine(result.error);
      vscode.window.showErrorMessage(
        'An error occurred when running a command'
      );

      return;
    }

    const changed = [...result.changes.created, ...result.changes.updated];

    changed.forEach(({ title = 'Unknown', type }, i) => {
      const icon = icons[type as IconType] ?? type;
      this.outputChannel.appendLine(`${icon} ${title}`);

      if (!this.panels.has(title)) {
        const panel = vscode.window.createWebviewPanel(
          'dhPanel', // Identifies the type of the webview. Used internally
          title,
          vscode.ViewColumn.Two,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        this.panels.set(title, panel);
      }

      this.panels.get(title)!.webview.html = this.getPanelHtml(title);

      this.panels.get(title)!.webview.onDidReceiveMessage(({ data }) => {
        this.handlePanelMessage(
          data,
          this.panels
            .get(title)!
            .webview.postMessage.bind(this.panels.get(title)!.webview)
        );
      });
    });
  }
}

export default DhService;
