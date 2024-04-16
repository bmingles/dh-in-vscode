import * as vscode from "vscode";
import type { dh as DhType } from "./dhc-types";
import DhRunner from "./DhRunner";
import { initDhcApi, initDhcSession } from "./dhc";
import { getPanelHtml } from "../util";

export class DhcRunner extends DhRunner<
  typeof DhType,
  DhType.IdeSession,
  DhType.ide.CommandResult
> {
  private psk?: string;

  protected async initApi() {
    return initDhcApi(this.serverUrl);
  }

  protected async createSession(dh: typeof DhType) {
    let ide: DhType.IdeSession | null = null;

    try {
      ide = await initDhcSession(dh, this.serverUrl, {
        type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
      });
    } catch (err) {
      console.error(err);
      this.outputChannel.appendLine(`Failed to connect anonymously: ${err}`);
      try {
        const token = await vscode.window.showInputBox({
          placeHolder: "Pre-Shared Key",
          prompt: "Enter your Deephaven pre-shared key",
          password: true,
        });

        ide = await initDhcSession(dh, this.serverUrl, {
          type: "io.deephaven.authentication.psk.PskAuthenticationHandler",
          token,
        });

        this.psk = token;
      } catch (err) {
        console.error(err);
      }
    }

    if (ide == null) {
      vscode.window.showErrorMessage("Failed to connect to Deephaven server");
    } else {
      vscode.window.showInformationMessage("Connected to Deephaven server");
    }

    return ide;
  }

  protected async runCode(text: string): Promise<DhType.ide.CommandResult> {
    return this.session!.runCode(text);
  }

  protected getPanelHtml(title: string): string {
    return getPanelHtml(this.serverUrl, title, this.psk);
  }
}

export default DhcRunner;
