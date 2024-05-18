import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { DebouncedEventQueue } from './DebouncedEventQueue';
import { DhServiceRegistry, DheService } from '../services';
import { WebClientDataFileNode, WebClientDataFsMap } from '../dh/dhe-fs-types';
import { CacheService } from '../services/CacheService';
import { ensureHasTrailingSlash, getServerUrlAndPath } from '../util';
import { DHE_CURRENT_FS_VERSION } from '../common';

export class WebClientDataFsProvider implements vscode.FileSystemProvider {
  constructor(dheServiceRegistry: DhServiceRegistry<DheService>) {
    this.dheServiceRegistry = dheServiceRegistry;

    this.fsCache = new CacheService(
      'fsCache',
      async key => {
        const dheService = await dheServiceRegistry.get(key);
        return dheService.buildFsMap();
      },
      ensureHasTrailingSlash
    );
  }

  private readonly dheServiceRegistry: CacheService<DheService>;
  private readonly fsCache: CacheService<WebClientDataFsMap>;

  private _eventQueue = new DebouncedEventQueue();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._eventQueue.event;

  /**
   * Copy files or folders.
   * @param source
   * @param destination
   * @param options
   */
  async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { readonly overwrite: boolean }
  ): Promise<void> {
    console.log('Copy:', source.path, '->', destination.path);
    const { root, path: sourcePath } = getServerUrlAndPath(source);
    const { path: destPath } = getServerUrlAndPath(destination);

    const { pathMap } = await this.fsCache.get(root);

    const sourceNode = pathMap.get(sourcePath);

    if (sourceNode == null) {
      throw vscode.FileSystemError.FileNotFound();
    }

    if (sourceNode.type === 'Folder') {
      throw new Error('Copy folder not yet supported.');
    }

    const destNode = pathMap.get(destPath);
    if (destNode) {
      throw new Error('Target file already exists.');
    }

    const file = await this.readFile(source);
    await this.writeFile(destination, file, { create: true, overwrite: false });
  }

  /**
   * Create a new directory.
   * @param uri
   */
  async createDirectory(uri: vscode.Uri): Promise<void> {
    console.log('createDirectory:', uri.path);

    const { root, path } = getServerUrlAndPath(uri);
    const { dirMap, pathMap } = await this.fsCache.get(root);

    const dheService = await this.dheServiceRegistry.get(root);
    const webClientData = await dheService.getWebClientData();

    const parentDirPath = dirname(path);
    const name = basename(path);
    const parentId = pathMap.get(parentDirPath)?.id ?? '';

    const row = {
      id: null,
      adminGroups: [],
      dataType: 'Folder',
      data: JSON.stringify({}),
      name: `${parentId}/${name}`,
      owner: dheService.getUsername(),
      status: 'Active',
      version: DHE_CURRENT_FS_VERSION,
      viewerGroups: [],
    };

    const createdRowId = await webClientData.createWorkspaceData(row);

    pathMap.set(path, {
      id: createdRowId,
      type: 'Folder',
      parentId,
      name,
    });

    dirMap.get(parentDirPath)!.push(pathMap.get(path)!);
    dirMap.set(path, []);
  }

  /**
   * Delete a file or folder.
   * @param uri
   * @param options
   */
  async delete(
    uri: vscode.Uri,
    options: { readonly recursive: boolean }
  ): Promise<void> {
    const { root, path } = getServerUrlAndPath(uri);
    console.log('delete:', uri.path, { root, path });

    const { dirMap, pathMap } = await this.fsCache.get(root);

    if (options.recursive && dirMap.has(path)) {
      const children = dirMap.get(path)!;

      for (const child of children) {
        await this.delete(vscode.Uri.joinPath(uri, child.name), options);
      }
    }

    const dheService = await this.dheServiceRegistry.get(root);
    const webClientData = await dheService.getWebClientData();

    const id = pathMap.get(path)?.id;

    const row =
      id == null
        ? null
        : await dheService.getWorkspaceRowById(webClientData, id);

    if (row == null) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    await webClientData.saveWorkspaceData(
      {
        ...row,
        data: JSON.stringify({ content: row.data.content }),
        status: 'Trashed',
      },
      DHE_CURRENT_FS_VERSION
    );

    if (dirMap.has(path)) {
      dirMap.delete(path);
    }

    // Remove from parent directory listing
    const parentDir = dirname(path);
    const name = basename(path);
    dirMap.set(
      parentDir,
      dirMap.get(parentDir)!.filter(n => n.name !== name)
    );

    pathMap.delete(path);
  }

  /**
   * Retrieve all files and folders in a directory.
   * @param uri
   */
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    console.log('readDirectory:', uri.path);

    const { root, path } = getServerUrlAndPath(uri);

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

  /**
   * Read the entire contents of a file.
   * @param uri
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    console.log('readFile:', uri.path);
    const { root, path } = getServerUrlAndPath(uri);
    const { pathMap } = await this.fsCache.get(root);

    const node = pathMap.get(path);
    if (node?.type === 'File') {
      return Buffer.from((node as WebClientDataFileNode).content);
    }
    throw vscode.FileSystemError.FileNotFound();
  }

  /**
   * Rename a file or folder.
   * @param oldUri
   * @param newUri
   * @param options
   */
  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { readonly overwrite: boolean }
  ): Promise<void> {
    const { root, path: sourcePath } = getServerUrlAndPath(oldUri);
    const { path: destPath } = getServerUrlAndPath(newUri);

    const { pathMap } = await this.fsCache.get(root);

    const sourceNode = pathMap.get(sourcePath);
    if (sourceNode == null) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }

    const dheService = await this.dheServiceRegistry.get(root);
    const webClientData = await dheService.getWebClientData();

    const row = await dheService.getWorkspaceRowById<{
      name: string;
      data: { content: unknown };
    }>(webClientData, sourceNode.id);
    if (row == null) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }

    const destDirId = pathMap.get(dirname(destPath))!.id;

    // name is in format 'parentDirId/filename'
    const name = `${destDirId}/${basename(destPath)}`;

    await webClientData.saveWorkspaceData(
      {
        ...row,
        data: JSON.stringify({ content: row.data.content }),
        name,
        nameLowercase: name.toLowerCase(),
      },
      DHE_CURRENT_FS_VERSION
    );

    this.fsCache.clearCache();

    // TODO: Figure out how to know when the rename is complete. For some reason
    // it is not available immediately after `saveWorkspaceData` is called
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Retrieve metadata about a file system node.
   * @param uri The URI of the file to retrieve metadata for.
   */
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { root, path } = getServerUrlAndPath(uri);
    console.log('stat:', uri.path, { isRoot: path === '/', root, path });

    // This seems to be a reasonable place to clear the fs cache. It fires
    // whenever focus leaves vscode and returns or when refresh file explorer
    // button is clicked.
    if (path === '/') {
      this.fsCache.clearCache();
    }

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

    console.log('stat not found:', uri.path);
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  /**
   * Subscribes to file change events in the file or folder denoted by uri. For
   * folders, the option recursive indicates whether subfolders, sub-subfolders,
   * etc. should be watched for file changes as well. With recursive: false,
   * only changes to the files that are direct children of the folder should
   * trigger an event.
   *
   * The excludes array is used to indicate paths that should be excluded from
   * file watching. It is typically derived from the files.watcherExclude setting that is configurable by the user. Each entry can be be:
   *
   * - the absolute path to exclude
   * - a relative path to exclude (for example build/output)
   * - a simple glob pattern (for example **​/build, output/**)
   *
   * It is the file system provider's job to call onDidChangeFile for every
   * change given these rules. No event should be emitted for files that match
   * any of the provided excludes.
   * @param uri
   * @param options
   * @returns
   */
  watch(
    uri: vscode.Uri,
    options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    }
  ): vscode.Disposable {
    console.log('watch:', uri.path, options);
    return new vscode.Disposable(() => {});
  }

  /**
   * Write a file to the FS
   * @param uri
   * @param contentArray
   * @param options
   */
  async writeFile(
    uri: vscode.Uri,
    contentArray: Uint8Array,
    _options: { readonly create: boolean; readonly overwrite: boolean }
  ): Promise<void> {
    console.log('writeFile:', uri.path);
    const { root, path } = getServerUrlAndPath(uri);
    const { dirMap, pathMap } = await this.fsCache.get(root);

    const doc = pathMap.get(path);
    const content = contentArray.toString();

    const dheService = await this.dheServiceRegistry.get(root);
    const webClientData = await dheService.getWebClientData();

    if (doc == null) {
      const dirName = dirname(path);
      const name = basename(path);
      const parentId = pathMap.get(dirName)?.id ?? '';

      const row = {
        id: null,
        adminGroups: [],
        dataType: 'File',
        data: JSON.stringify({ content }),
        name: `${parentId}/${name}`,
        owner: dheService.getUsername(),
        status: 'Active',
        version: DHE_CURRENT_FS_VERSION,
        viewerGroups: [],
      };

      const createdRowId = await webClientData.createWorkspaceData(row);

      pathMap.set(path, {
        id: createdRowId,
        type: 'File',
        parentId,
        name,
        content,
      });

      dirMap.get(dirName)!.push(pathMap.get(path)!);

      return;
    }

    if (doc.type !== 'File') {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const row = await dheService.getWorkspaceRowById(webClientData, doc.id);

    await webClientData.saveWorkspaceData(
      { ...row, data: JSON.stringify({ content }) },
      DHE_CURRENT_FS_VERSION
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
