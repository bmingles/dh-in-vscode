import * as vscode from 'vscode';

/*
 * Panels steal focus when they finish loading which causes the run
 * buttons to disappear. To fix this:
 *
 * 1. Track a panel in `panelsPendingInitialFocus` before setting html (in `runEditorCode`)
 * 2. If panel state changes in a way that results in tabgroup changing, stop
 * tracking the panel and restore the focus to the original editor
 */
export class PanelFocusManager {
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
    console.log('Initializing panel:', panel.title, 2);

    // Only count the last panel initialized
    this.panelsPendingInitialFocus = new WeakMap();
    this.panelsPendingInitialFocus.set(panel, 2);
  }

  handleOnDidChangeViewState(panel: vscode.WebviewPanel): () => void {
    return (): void => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      const activeTabGroupViewColumn =
        vscode.window.tabGroups.activeTabGroup.viewColumn;
      const activeEditorViewColumn = vscode.window.activeTextEditor!.viewColumn;

      const didChangeFocus =
        activeTabGroupViewColumn !== activeEditorViewColumn;

      console.log('Focus changed:', {
        activeEditorViewColumn,
        activeTabGroupViewColumn,
      });

      const pendingChangeCount = this.panelsPendingInitialFocus.get(panel) ?? 0;
      console.log(
        'Pending panel change count:',
        panel.title,
        pendingChangeCount
      );

      if (!uri || !didChangeFocus || pendingChangeCount <= 0) {
        return;
      }

      this.panelsPendingInitialFocus.set(panel, pendingChangeCount - 1);

      vscode.window.showTextDocument(uri, {
        preview: false,
        viewColumn: activeEditorViewColumn,
      });
    };
  }
}
