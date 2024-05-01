import * as vscode from 'vscode';
import { DebouncedEventQueue } from './DebouncedEventQueue';
import { DheService, WebClientDataFsService } from '../services';
import { WebClientDataFileNode } from '../dh/dhe-fs-types';
import { getWorkspaceRowById } from '../dh/dhe';

export class WebClientDataFsProvider implements vscode.FileSystemProvider {
  constructor(dheService: DheService, fsService: WebClientDataFsService) {
    this.dheService = dheService;
    this.fsService = fsService;
  }

  private readonly dheService: DheService;
  private readonly fsService: WebClientDataFsService;

  private _eventQueue = new DebouncedEventQueue();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._eventQueue.event;

  copy?(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { readonly overwrite: boolean }
  ): void | Thenable<void> {
    throw new Error('copy: method not implemented.');
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    console.log('createDirectory:', uri.path);
    // const basename = path.posix.basename(uri.path);
    // const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    // const parent = this._lookupAsDirectory(dirname, false);
    // const entry = new Directory(basename);
    // parent.entries.set(entry.name, entry);
    // parent.mtime = Date.now();
    // parent.size += 1;
  }

  delete(
    uri: vscode.Uri,
    options: { readonly recursive: boolean }
  ): void | Thenable<void> {
    throw new Error('delete: method not implemented.');
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    console.log('readDirectory:', uri.path);

    // return [];

    const { dirMap } = await this.fsService.getFsMap();

    const children = dirMap.get(uri.path) ?? [];

    const result = children.map(
      ({ name, type }) =>
        [
          name,
          type === 'File' ? vscode.FileType.File : vscode.FileType.Directory,
        ] as [string, vscode.FileType]
    );

    console.log('result:', result);

    return result;
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    console.log('readFile:', uri.path);
    const { pathMap } = await this.fsService.getFsMap();

    const node = pathMap.get(uri.path);
    if (node?.type === 'File') {
      return Buffer.from((node as WebClientDataFileNode).content);
    }
    throw vscode.FileSystemError.FileNotFound();
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean }
  ): void | Thenable<void> {
    throw new Error('rename: method not implemented.');
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    console.log('stat:', uri.path);

    if (uri.path === '/') {
      return {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      };
    }
    // throw vscode.FileSystemError.FileNotFound(uri);

    const { dirMap, pathMap } = await this.fsService.getFsMap();

    if (dirMap.has(uri.path)) {
      return {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      };
    } else if (pathMap.has(uri.path)) {
      return {
        type:
          pathMap.get(uri.path)!.type === 'File'
            ? vscode.FileType.File
            : vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  watch(
    uri: vscode.Uri,
    options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    }
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async writeFile(
    uri: vscode.Uri,
    contentArray: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean }
  ): Promise<void> {
    console.log('writeFile:', uri.path);
    const { pathMap } = await this.fsService.getFsMap();

    const doc = pathMap.get(uri.path);
    if (doc == null || doc.type !== 'File') {
      // TODO: Implement create
      throw new Error(`Doc not found: ${uri.path}`);
    }

    const webClientData = await this.dheService.getWebClientData();

    const content = contentArray.toString();
    const row = await this.dheService.getWorkspaceRowById(
      webClientData,
      doc.id
    );

    await webClientData.saveWorkspaceData(
      { ...row, data: JSON.stringify({ content }) },
      8 // TODO: Should this be a constant or derived somehow?
    );

    doc.content = content;
    // throw new Error("writeFile: method not implemented.");

    // TODO: To save files to workspace, we need to use something similar to
    // WorkspaceStorage.updateItem in Enterprise
    // 1. load existing row by id (can probably skip deserializing since Data will be replaced)
    // 2. update Data column with new content (stringified JSON)
    // 3. saveWorkspaceData (WorkspaceStorage.saveData)
  }
}
