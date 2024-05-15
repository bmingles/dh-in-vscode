import * as vscode from 'vscode';
import {
  CONFIG_CORE_SERVERS,
  CONFIG_ENTERPRISE_SERVERS,
  CONFIG_KEY,
} from '../common';

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_KEY);
}

function getCoreServers(): string[] {
  return getConfig().get(CONFIG_CORE_SERVERS, []);
}

function getEnterpriseServers(): string[] {
  return getConfig().get(CONFIG_ENTERPRISE_SERVERS, []);
}

function hasEnterpriseServers() {
  return getEnterpriseServers().length > 0;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Config = {
  getCoreServers,
  getEnterpriseServers,
  hasEnterpriseServers,
};
