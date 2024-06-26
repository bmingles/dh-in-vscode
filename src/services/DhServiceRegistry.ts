import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { DhcService } from './DhcService';
import { ensureHasTrailingSlash } from '../util';
import DheService from './DheService';

export class DhServiceRegistry<
  T extends DhcService | DheService
> extends CacheService<T> {
  constructor(
    serviceFactory: new (
      serverUrl: string,
      outputChannel: vscode.OutputChannel
    ) => T,
    outputChannel: vscode.OutputChannel
  ) {
    super(
      serviceFactory.name,
      async serverUrl => {
        if (serverUrl == null) {
          throw new Error(`${serviceFactory.name} server url is null.`);
        }

        return new serviceFactory(serverUrl, outputChannel);
      },
      ensureHasTrailingSlash
    );
  }
}
