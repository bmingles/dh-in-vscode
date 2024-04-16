import * as vscode from "vscode";
import type { dh as DhType } from "./dhc-types";

/* eslint-disable @typescript-eslint/naming-convention */
const icons = {
  Figure: "📈",
  "deephaven.plot.express.DeephavenFigure": "📈",
  Table: "⬜",
  "deephaven.ui.Element": "✨",
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

export abstract class DhRunner<
  TDH,
  TSession,
  TCommandResult extends CommandResultBase
> {
  constructor(serverUrl: string, outputChannel: vscode.OutputChannel) {
    this.serverUrl = serverUrl;
    this.outputChannel = outputChannel;
  }

  protected outputChannel: vscode.OutputChannel;
  private panels = new Map<string, vscode.WebviewPanel>();

  protected dh: TDH | null = null;
  protected serverUrl: string;
  protected session: TSession | null = null;

  protected abstract initApi(): Promise<TDH>;
  protected abstract createSession(dh: TDH): Promise<TSession | null>;
  protected abstract runCode(text: string): Promise<TCommandResult>;
  protected abstract getPanelHtml(title: string): string;

  protected async initDh() {
    try {
      vscode.window.showInformationMessage("Initializing Deephaven API");
      this.dh = await this.initApi();
    } catch (err) {
      console.error(err);
      this.outputChannel.appendLine(
        `Failed to initialize Deephaven API: ${err}`
      );
      vscode.window.showErrorMessage("Failed to initialize Deephaven API");
      return;
    }

    this.session = await this.createSession(this.dh);

    this.outputChannel.show();
  }

  public async runEditorCode(
    editor: vscode.TextEditor,
    selectionOnly = false
  ): Promise<void> {
    if (editor.document.languageId !== "python") {
      // This should not actually happen
      console.log(`languageId '${editor.document.languageId}' not supported.`);
      return;
    }

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

    console.log("Sending text to dh:", text);

    const result = await this.runCode(text);

    if (result.error) {
      console.error(result.error);
      this.outputChannel.appendLine(result.error);
      vscode.window.showErrorMessage(
        "An error occurred when running a command"
      );

      return;
    }

    const changed = [...result.changes.created, ...result.changes.updated];

    changed.forEach(({ title = "Unknown", type }, i) => {
      const icon = icons[type as IconType] ?? type;
      this.outputChannel.appendLine(`${icon} ${title}`);

      if (!this.panels.has(title)) {
        const panel = vscode.window.createWebviewPanel(
          "dhPanel", // Identifies the type of the webview. Used internally
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
    });
  }
}

export default DhRunner;
