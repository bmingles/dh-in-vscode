import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EnterpriseDhType as DheType } from './dhe-types';
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
