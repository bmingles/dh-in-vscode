import * as fs from 'node:fs';
import * as path from 'node:path';
import type { dh as DhcType } from './dhc-types';
import type {
  EnterpriseClient,
  EnterpriseDhType as DheType,
  QueryInfo,
  Table,
  DeserializedRowData,
  Row,
  Column,
} from './dhe-types';
import { downloadFromURL, getTempDir, polyfillDh } from '../util';
import { WebClientDataFsMap, WebClientDataFsNode } from './dhe-fs-types';

export async function initDheApi(serverUrl: string): Promise<DheType> {
  polyfillDh();

  const tempDir = getTempDir();

  const dhe = await getDhe(serverUrl, tempDir, true);

  return dhe;
}

export async function getDhe(
  serverUrl: string,
  outDir: string,
  download: boolean
): Promise<DheType> {
  if (download) {
    const dhe = await downloadFromURL(
      path.join(serverUrl, 'irisapi/irisapi.nocache.js')
    );
    fs.writeFileSync(path.join(outDir, 'irisapi.nocache.js'), dhe);
  }

  require(path.join(outDir, 'irisapi.nocache.js'));

  // This is set on the global object
  // @ts-ignore
  return iris;
}

// Get auth token from the DHE client
export async function getAuthToken(
  client: EnterpriseClient
): Promise<{ type: string; token: string }> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

// Copy / modified from DnDUtils.getCommunityClient
export async function getAuthenticatedDhcWorkerClient(
  client: EnterpriseClient,
  dh: typeof DhcType,
  grpcUrl: string,
  _envoyPrefix: string | null
): Promise<DhcType.CoreClient> {
  let clientOptions: DhcType.ConnectOptions | undefined;
  // if (envoyPrefix != null) {
  //   clientOptions = {
  //     headers: { 'envoy-prefix': envoyPrefix },
  //   };
  // }

  try {
    console.info('Init community client', grpcUrl);
    const coreClient = new dh.CoreClient(grpcUrl, clientOptions);
    console.debug('Core client', coreClient, grpcUrl);

    const authToken = await getAuthToken(client);

    console.debug('Logging in with', authToken, grpcUrl);
    await coreClient.login(authToken);
    console.debug('Log in success', grpcUrl);

    return coreClient;
  } catch (err) {
    console.error('Failed to init community client', err);
    throw err;
  }
}

export async function buildFsMap(
  dhe: DheType,
  client: EnterpriseClient
): Promise<WebClientDataFsMap> {
  try {
    // await includeIrisAsync(IRIS_API_URL, apiFileName);

    // const client = new iris.Client(WS_URL);

    // await new Promise((resolve) =>
    //   client.addEventListener(iris.Client.EVENT_CONNECT, resolve)
    // );

    // await client.login(credentials);

    // const ide = new iris.Ide(client);
    // const cn = await ide.createConsole(new iris.ConsoleConfig());
    // console.log("cn:", cn);
    // const session = await cn.startSession("python");
    // console.log("session:", session);

    // const result = await session.runCode("x = 5\n").catch((err) => {
    //   console.error("err:", err);
    // });
    // console.log("result:", result);

    const fsIdMap = await getFsIdMap(dhe, client);

    console.log('fsIdMap:', fsIdMap);

    const dirMap = new Map<string, WebClientDataFsNode[]>();
    const pathMap = new Map<string, WebClientDataFsNode>();

    for (const node of fsIdMap.values()) {
      let path = '';
      let currentNode: WebClientDataFsNode | undefined = node;
      while (currentNode != null) {
        path = `/${currentNode.name}${path}`;
        currentNode = fsIdMap.get(currentNode.parentId);
      }

      const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
      if (!dirMap.has(parentPath)) {
        dirMap.set(parentPath, []);
      }

      if (node.type === 'Folder' && !dirMap.has(path)) {
        dirMap.set(path, []);
      }

      dirMap.get(parentPath)!.push(node);
      pathMap.set(path, node);
    }

    console.log('fsDirMap:', dirMap);
    console.log('fsPathMap:', pathMap);

    return { dirMap, pathMap };
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export function getWsUrl(serverUrl: string): string {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url.href;
}

/**
 * Get WebClientData query from known configs or wait for it to be added.
 * @param client
 */
export async function getWebClientData(
  dhe: DheType,
  client: EnterpriseClient
): Promise<QueryInfo> {
  const queryInfo = client
    .getKnownConfigs()
    .find(({ name }) => name === 'WebClientData');

  if (queryInfo != null) {
    return queryInfo;
  }

  return await new Promise<QueryInfo>(resolve =>
    client.addEventListener(
      dhe.Client.EVENT_CONFIG_ADDED,
      ({ detail }: any) => {
        if (detail.name === 'WebClientData') {
          resolve(detail);
        }
      }
    )
  );
}

/**
 * Map values for all given columns to a new object. `Data` column will be
 * parsed as JSON.
 * @param row
 * @param columns
 */
export function deserializeRow(
  row: Row,
  columns: Column[]
): DeserializedRowData {
  const result = {} as DeserializedRowData;

  columns.forEach(column => {
    const raw = row.get(column);

    try {
      const columnName = column.name.replace(/^[A-Z]/, firstLetter =>
        firstLetter.toLowerCase()
      );
      result[columnName] = column.name === 'Data' ? JSON.parse(raw) : raw;
    } catch {
      console.error('An error occurred while parsing Data prop:', result);
    }
  });

  return result;
}

export async function getWorkspaceDataTable(
  webClientData: QueryInfo
): Promise<Table> {
  return webClientData.getTable('workspaceData');
}

export async function getWorkspaceRowById(
  dhe: DheType,
  webClientData: QueryInfo,
  id: string
): Promise<DeserializedRowData | null> {
  const table = await getWorkspaceDataTable(webClientData);

  const [idColumnFilter, statusColumnFilter] = table
    .findColumns(['Id', 'Status'])
    .map(col => col.filter());

  const filterCondition = idColumnFilter
    .eq(dhe.FilterValue.ofString(id))
    .and(statusColumnFilter.eq(dhe.FilterValue.ofString('Active')));

  table.applyFilter([filterCondition]);
  table.setViewport(0, 0);

  const tableData = await table.getViewportData();

  if (tableData.rows.length === 0) {
    return null;
  }

  return deserializeRow(tableData.get(0), table.columns);
}

async function getFsIdMap(
  dhe: DheType,
  client: EnterpriseClient
): Promise<Map<string, WebClientDataFsNode>> {
  // const webClientData = await new Promise<QueryInfo>((resolve) =>
  //   client.addEventListener(
  //     iris.Client.EVENT_CONFIG_ADDED,
  //     ({ detail }: any) => {
  //       if (detail.name === "WebClientData") {
  //         resolve(detail);
  //       }
  //     }
  //   )
  // );

  // const table: Table = await webClientData.getTable("workspaceData");
  const webClientData = await getWebClientData(dhe, client);
  const table: Table = await getWorkspaceDataTable(webClientData);

  // columns
  const idColumn = table.findColumn('Id');
  const nameColumn = table.findColumn('Name');
  const dataTypeColumn = table.findColumn('DataType');
  const dataColumn = table.findColumn('Data');
  const statusColumn = table.findColumn('Status');
  const lastModifiedTimeColumn = table.findColumn('LastModifiedTime');

  // filters
  const statusColumnFilter = statusColumn!.filter();
  const activeFilterCondition = statusColumnFilter.eq(
    dhe.FilterValue.ofString('Active')
  );

  const dataTypeColumnFilter = dataTypeColumn!.filter();
  const fileFilterCondition = dataTypeColumnFilter
    .eq(dhe.FilterValue.ofString('File'))
    .or(dataTypeColumnFilter.eq(dhe.FilterValue.ofString('Folder')));

  table.applyFilter([activeFilterCondition, fileFilterCondition]);

  table.setViewport(0, table.size);
  const viewportData = await table.getViewportData();

  const fsMap = new Map<string, WebClientDataFsNode>();

  viewportData.rows.forEach(row => {
    const [parentId, name] = row.get(nameColumn).split('/');

    const item: WebClientDataFsNode = {
      id: row.get(idColumn),
      parentId,
      name,
      type: row.get(dataTypeColumn),
      content: JSON.parse(row.get(dataColumn)).content,
      lastModified: row.get(lastModifiedTimeColumn),
    };

    fsMap.set(item.id, item);
  });

  return fsMap;
}
