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

  public readonly serverUrl: string;

  protected outputChannel: vscode.OutputChannel;
  private panels = new Map<string, vscode.WebviewPanel>();
  private cachedCreateClient: Promise<TClient> | null = null;
  private cachedCreateSession: Promise<TSession | null> | null = null;
  private cachedInitApi: Promise<TDH> | null = null;

  protected dh: TDH | null = null;
  protected client: TClient | null = null;
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
        this.outputChannel.appendLine(
          `Initializing Deephaven API...: ${this.serverUrl}`
        );
        this.cachedInitApi = this.initApi();
      }
      this.dh = await this.cachedInitApi;

      this.outputChannel.appendLine(
        `Initialized Deephaven API: ${this.serverUrl}`
      );
    } catch (err) {
      console.error(err);
      this.outputChannel.appendLine(
        `Failed to initialize Deephaven API: ${err}`
      );
      vscode.window.showErrorMessage('Failed to initialize Deephaven API');
      return;
    }

    if (this.cachedCreateClient == null) {
      this.outputChannel.appendLine('Creating client...');
      this.cachedCreateClient = this.createClient(this.dh);
    }
    this.client = await this.cachedCreateClient;

    if (this.cachedCreateSession == null) {
      this.outputChannel.appendLine('Creating session...');
      this.cachedCreateSession = this.createSession(this.dh, this.client);
    }
    this.session = await this.cachedCreateSession;

    if (this.session == null) {
      vscode.window.showErrorMessage(
        `Failed to create Deephaven session: ${this.serverUrl}`
      );
    } else {
      vscode.window.showInformationMessage(
        `Created Deephaven session: ${this.serverUrl}`
      );
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

    this.outputChannel.appendLine(
      `Sending${selectionOnly ? ' selected' : ''} code to: ${this.serverUrl}`
    );

    if (this.session == null) {
      await this.initDh();
    }

    if (this.session == null) {
      return;
    }

    const selectionRange =
      selectionOnly && editor.selection
        ? new vscode.Range(
            editor.selection.start.line,
            0,
            editor.selection.end.line,
            editor.document.lineAt(editor.selection.end.line).text.length
          )
        : undefined;

    const text = editor.document.getText(selectionRange);

    console.log('Sending text to dh:', text);

    let result: CommandResultBase;
    let error: string | null = null;

    try {
      result = await this.runCode(text);
      error = result.error;
    } catch (err) {
      error = String(err);
    }

    if (error) {
      console.error(error);
      this.outputChannel.show(true);
      this.outputChannel.appendLine(error);
      vscode.window.showErrorMessage(
        'An error occurred when running a command'
      );

      return;
    }

    const changed = [...result!.changes.created, ...result!.changes.updated];

    changed.forEach(({ title = 'Unknown', type }, i) => {
      const icon = icons[type as IconType] ?? type;
      this.outputChannel.appendLine(`${icon} ${title}`);

      // Don't show panels for variables starting with '_'
      if (title.startsWith('_')) {
        return;
      }

      if (!this.panels.has(title)) {
        const panel = vscode.window.createWebviewPanel(
          'dhPanel', // Identifies the type of the webview. Used internally
          title,
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        this.panels.set(title, panel);

        // If panel gets disposed, remove it from the cache
        panel.onDidDispose(() => {
          this.panels.delete(title);
        });
      }

      const panel = this.panels.get(title)!;

      panel.webview.html = this.getPanelHtml(title);

      panel.webview.onDidReceiveMessage(({ data }) => {
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
