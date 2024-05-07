import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { DheService } from './DheService';

export class DheServiceRegistry extends CacheService<DheService> {
  constructor(outputChannel: vscode.OutputChannel) {
    super(async dheServerUrl => {
      if (dheServerUrl == null) {
        throw new Error('DHE host is not set');
      }

      return new DheService(dheServerUrl, outputChannel);
    });
  }
}
