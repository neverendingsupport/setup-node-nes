import BaseDistribution from '../base-distribution';
import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import {NodeInputs, INodeVersionInfo, INodeVersion} from '../base-models';
import semver from 'semver';

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
    return 'https://registry.nes.herodevs.com/nodejs/nes';
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

  protected getNodejsDistInfo(version: string) {
    const osArch: string = this.translateArchToDistUrl(this.nodeInfo.arch);
    version = semver.clean(version) || '';
    const fileName: string =
      this.osPlat == 'win32'
        ? `node-v${version}-nes-win-${osArch}`
        : `node-v${version}-nes-${this.osPlat}-${osArch}`;
    const urlFileName: string =
      this.osPlat == 'win32'
        ? this.nodeInfo.arch === 'arm64'
          ? `${fileName}.zip`
          : `${fileName}.7z`
        : `${fileName}.tar.gz`;
    const initialUrl = this.getDistributionUrl();
    const url = `${initialUrl}/v${version}-nes/${urlFileName}`;

    return <INodeVersionInfo>{
      downloadUrl: url,
      resolvedVersion: version,
      arch: osArch,
      fileName: fileName
    };
  }

  protected validRange(versionSpec: string) {
    let range: string;
    const [raw, nes] = this.splitVersionSpec(versionSpec);
    const isValidVersion = semver.valid(raw);
    const rawVersion = (isValidVersion ? raw : semver.coerce(raw))!;

    if (nes !== this.distribution) {
      range = versionSpec;
    } else {
      range = `${semver.validRange(`^${rawVersion}`)}-${this.distribution}`;
    }

    return {range, options: {includePrerelease: false}};
  }

  protected splitVersionSpec(versionSpec: string) {
    const match = versionSpec.match(/^(.*?)-(.+)$/);
    if (match) {
      return [match[1], match[2]];
    } else {
      return [versionSpec, ''];
    }
  }
}
