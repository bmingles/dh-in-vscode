import { DateWrapper } from './dhe-types';

export interface WebClientDataFsNodeBase {
  id: string;
  type: 'File' | 'Folder';
  parentId: string;
  name: string;
  lastModified?: DateWrapper;
}

export interface WebClientDataFileNode extends WebClientDataFsNodeBase {
  type: 'File';
  content: string;
}

export interface WebClientDataFolderNode extends WebClientDataFsNodeBase {
  type: 'Folder';
}

export type WebClientDataFsNode = WebClientDataFsNodeBase &
  (WebClientDataFileNode | WebClientDataFolderNode);

export interface WebClientDataFsMap {
  dirMap: Map<string, WebClientDataFsNode[]>;
  pathMap: Map<string, WebClientDataFsNode>;
}
