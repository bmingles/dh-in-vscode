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
  private panelFocusManager = new PanelFocusManager();
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
          // set `preserveFocus` to false so that panel associated with running
          // script gets focus. Note that the tab group will then get blurred
          // by the `PanelFocusManager`, but the resulting tab should still be
          // the active tab within the non-active tab group.
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: false },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        this.panels.set(title, panel);

        // If panel gets disposed, remove it from the caches
        panel.onDidDispose(() => {
          this.panels.delete(title);
        });

        // Ensure focus is not stolen when panel is loaded
        panel.onDidChangeViewState(
          this.panelFocusManager.handleOnDidChangeViewState(panel)
        );
      }

      const panel = this.panels.get(title)!;
      this.panelFocusManager.initialize(panel);

      panel.webview.html = this.getPanelHtml(title);
      panel.reveal();

      // TODO: This seems to be subscribing multiple times. Need to see if we
      // can move it inside of the panel creation block
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

/*
 * Panels steal focus when they finish loading which causes the run
 * buttons to disappear. To fix this:
 *
 * 1. Track a panel in `panelsPendingInitialFocus` before setting html (in `runEditorCode`)
 * 2. If panel state changes in a way that results in tabgroup changing, stop
 * tracking the panel and restore the focus to the original editor
 */
class PanelFocusManager {
  /**
   * Panels steal focus when they finish loading which causes the run buttons to
   * disappear. To fix this:
   * 1. Track a panel in `panelsPendingInitialFocus` before setting html. We set
   * a counter of 2 because we expect 2 state changes to happen to the panel that
   * result in the tabgroup switching (1 when we call reveal and 1 when the panel
   * finishes loading and steals focus)
   * 2. If panel state changes in a way that results in tabgroup changing,
   * decrement the counter for the panel. Once the counter hits zero, restore
   * the focus to the original editor
   */
  private panelsPendingInitialFocus = new WeakMap<
    vscode.WebviewPanel,
    number
  >();

  initialize(panel: vscode.WebviewPanel): void {
    this.panelsPendingInitialFocus.set(panel, 2);
  }

  handleOnDidChangeViewState(panel: vscode.WebviewPanel): () => void {
    return (): void => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      const didChangeFocus =
        vscode.window.tabGroups.activeTabGroup.viewColumn !==
        vscode.window.activeTextEditor!.viewColumn;

      const pendingChangeCount = this.panelsPendingInitialFocus.get(panel) ?? 0;

      if (!uri || !didChangeFocus || pendingChangeCount <= 0) {
        return;
      }

      this.panelsPendingInitialFocus.set(panel, pendingChangeCount - 1);

      vscode.window.showTextDocument(uri, {
        preview: false,
        viewColumn: vscode.window.activeTextEditor!.viewColumn,
      });
    };
  }
}
