import * as vscode from 'vscode';
import { DebouncedEventQueue } from './DebouncedEventQueue';
import { DheService } from '../services';
import { WebClientDataFileNode, WebClientDataFsMap } from '../dh/dhe-fs-types';
import { CacheService } from '../services/CacheService';

export class WebClientDataFsProvider implements vscode.FileSystemProvider {
  constructor(dheServiceRegistry: CacheService<DheService>) {
    this.dheServiceRegistry = dheServiceRegistry;

    this.fsCache = new CacheService(async key => {
      const dheService = await dheServiceRegistry.get(key);
      return dheService.buildFsMap();
    });
  }

  private readonly dheServiceRegistry: CacheService<DheService>;
  private readonly fsCache: CacheService<WebClientDataFsMap>;

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

    const { root, path } = splitPath(uri.path);

    const { dirMap } = await this.fsCache.get(root);

    const children = dirMap.get(path) ?? [];

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
    const { root, path } = splitPath(uri.path);
    const { pathMap } = await this.fsCache.get(root);

    const node = pathMap.get(path);
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
    const { root, path } = splitPath(uri.path);
    console.log('stat:', uri.path, { root, path });

    if (uri.path === '/' || path === '/') {
      return {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      };
    }
    // throw vscode.FileSystemError.FileNotFound(uri);

    const { dirMap, pathMap } = await this.fsCache.get(root);

    if (dirMap.has(path)) {
      return {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
      };
    } else if (pathMap.has(path)) {
      return {
        type:
          pathMap.get(path)!.type === 'File'
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
    const { root, path } = splitPath(uri.path);
    const { pathMap } = await this.fsCache.get(root);

    const doc = pathMap.get(path);
    if (doc == null || doc.type !== 'File') {
      // TODO: Implement create
      throw new Error(`Doc not found: ${uri.path}`);
    }

    const dheService = await this.dheServiceRegistry.get(root);
    const webClientData = await dheService.getWebClientData();

    const content = contentArray.toString();
    const row = await dheService.getWorkspaceRowById(webClientData, doc.id);

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

function splitPath(fullPath: string): { root: string; path: string } {
  const [, root = '', path = ''] = /\/([^/]+)(.*)/.exec(fullPath) ?? [];
  return {
    root: root.replace(/^(https?:)/, '$1//'),
    path: path === '' ? '/' : path,
  };
}
