import BaseDistribution from '../base-distribution';
import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import {NodeInputs, INodeVersionInfo, INodeVersion} from '../base-models';

export default class NesBuilds extends BaseDistribution {
  protected distribution = 'nes';
  private nesRegistryToken: string | undefined;
  constructor(nodeInfo: NodeInputs) {
    super(nodeInfo);
    this.nesRegistryToken = nodeInfo.nesRegistryToken;
    if (!this.nesRegistryToken) {
      throw new Error(
        'NES registry token is required to download Node.js from NES registry'
      );
    }
  }

  protected getDistributionUrl(): string {
    return 'https://registry.dev.nes.herodevs.com/nodejs/nes';
  }

  protected async getNodeJsVersions(): Promise<INodeVersion[]> {
    const initialUrl = this.getDistributionUrl();
    const dataUrl = `${initialUrl}/index.json`;

    const response = await this.httpClient.getJson<INodeVersion[]>(dataUrl, {
      Authorization: `Bearer ${this.nesRegistryToken}`
    });
    return response.result || [];
  }

  protected async downloadNodejs(info: INodeVersionInfo) {
    let downloadPath = '';
    core.info(
      `Acquiring ${info.resolvedVersion} - ${info.arch} from ${info.downloadUrl}`
    );
    try {
      downloadPath = await tc.downloadTool(
        info.downloadUrl,
        undefined,
        undefined,
        {
          Authorization: `Bearer ${this.nesRegistryToken}`
        }
      );
    } catch (err) {
      if (
        err instanceof tc.HTTPError &&
        err.httpStatusCode == 404 &&
        this.osPlat == 'win32'
      ) {
        return await this.acquireWindowsNodeFromFallbackLocation(
          info.resolvedVersion,
          info.arch
        );
      }

      throw err;
    }

    const toolPath = await this.extractArchive(downloadPath, info);
    core.info('Done');

    return toolPath;
  }
}
