import * as fs from 'node:fs';
import * as path from 'node:path';
import type { dh as DhcType } from './dhc-types';
import type {
  EnterpriseClient,
  EnterpriseDhType as DheType,
} from './dhe-types';
import { downloadFromURL, getTempDir, polyfillDh } from '../util';

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
