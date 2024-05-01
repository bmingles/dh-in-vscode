import { WebClientDataFsMap } from '../dh/dhe-fs-types';

export class WebClientDataFsService {
  constructor(buildFsMap: () => Promise<WebClientDataFsMap>) {
    this.buildFsMap = buildFsMap;
  }

  private buildFsMap: () => Promise<WebClientDataFsMap>;
  private fsMap: WebClientDataFsMap | null = null;

  public async getFsMap(): Promise<WebClientDataFsMap> {
    // return {
    //   dirMap: new Map<string, WebClientDataFsNode[]>(),
    //   pathMap: new Map<string, WebClientDataFsNode>(),
    // };

    if (!this.fsMap) {
      this.fsMap = await this.buildFsMap();
    }

    return this.fsMap;
  }
}
