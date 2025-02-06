import * as core from '@actions/core';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import * as httpm from '@actions/http-client';
import * as exec from '@actions/exec';
import * as cache from '@actions/cache';
import fs from 'fs';
import cp from 'child_process';
import osm from 'os';
import path from 'path';
import * as main from '../src/main';
import * as auth from '../src/authutil';
import {INodeVersion} from '../src/distributions/base-models';

import nodeTestDist from './data/node-dist-index.json';
import nodeTestDistNightly from './data/node-nightly-index.json';
import nodeTestDistRc from './data/node-rc-index.json';
import nodeTestDistNes from './data/node-nes-index.json';

describe('setup-node', () => {
  let inputs = {} as any;
  let os = {} as any;

  let inSpy: jest.SpyInstance;
  let findSpy: jest.SpyInstance;
  let findAllVersionsSpy: jest.SpyInstance;
  let cnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let platSpy: jest.SpyInstance;
  let archSpy: jest.SpyInstance;
  let dlSpy: jest.SpyInstance;
  let exSpy: jest.SpyInstance;
  let cacheSpy: jest.SpyInstance;
  let dbgSpy: jest.SpyInstance;
  let whichSpy: jest.SpyInstance;
  let existsSpy: jest.SpyInstance;
  let mkdirpSpy: jest.SpyInstance;
  let execSpy: jest.SpyInstance;
  let authSpy: jest.SpyInstance;
  let isCacheActionAvailable: jest.SpyInstance;
  let getExecOutputSpy: jest.SpyInstance;
  let getJsonSpy: jest.SpyInstance;

  beforeEach(() => {
    // @actions/core
    console.log('::stop-commands::stoptoken'); // Disable executing of runner commands when running tests in actions
    process.env['GITHUB_PATH'] = ''; // Stub out ENV file functionality so we can verify it writes to standard out
    process.env['GITHUB_OUTPUT'] = ''; // Stub out ENV file functionality so we can verify it writes to standard out
    inputs = {};
    inSpy = jest.spyOn(core, 'getInput');
    inSpy.mockImplementation(name => inputs[name]);

    // node
    os = {};
    platSpy = jest.spyOn(osm, 'platform');
    platSpy.mockImplementation(() => os['platform']);
    archSpy = jest.spyOn(osm, 'arch');
    archSpy.mockImplementation(() => os['arch']);
    execSpy = jest.spyOn(cp, 'execSync');

    // @actions/tool-cache
    findSpy = jest.spyOn(tc, 'find');
    findAllVersionsSpy = jest.spyOn(tc, 'findAllVersions');
    dlSpy = jest.spyOn(tc, 'downloadTool');
    exSpy = jest.spyOn(tc, 'extractTar');
    cacheSpy = jest.spyOn(tc, 'cacheDir');
    // getDistSpy = jest.spyOn(im, 'getVersionsFromDist');

    // http-client
    getJsonSpy = jest.spyOn(httpm.HttpClient.prototype, 'getJson');

    // io
    whichSpy = jest.spyOn(io, 'which');
    existsSpy = jest.spyOn(fs, 'existsSync');
    mkdirpSpy = jest.spyOn(io, 'mkdirP');

    // @actions/tool-cache
    isCacheActionAvailable = jest.spyOn(cache, 'isFeatureAvailable');
    isCacheActionAvailable.mockImplementation(() => false);

    // disable authentication portion for installer tests
    authSpy = jest.spyOn(auth, 'configAuthentication');
    authSpy.mockImplementation(() => {});

    getJsonSpy.mockImplementation(url => {
      let res: any;
      if (url.includes('/rc')) {
        res = <INodeVersion[]>nodeTestDistRc;
      } else if (url.includes('/nightly')) {
        res = <INodeVersion[]>nodeTestDistNightly;
      } else if (url.includes('/nes')) {
        res = <INodeVersion[]>nodeTestDistNes;
      } else {
        res = <INodeVersion[]>nodeTestDist;
      }

      return {result: res};
    });

    // writes
    cnSpy = jest.spyOn(process.stdout, 'write');
    logSpy = jest.spyOn(core, 'info');
    dbgSpy = jest.spyOn(core, 'debug');
    warningSpy = jest.spyOn(core, 'warning');
    cnSpy.mockImplementation(line => {
      // uncomment to debug
      // process.stderr.write('write:' + line + '\n');
    });
    logSpy.mockImplementation(line => {
      // uncomment to debug
      // process.stderr.write('log:' + line + '\n');
    });
    dbgSpy.mockImplementation(msg => {
      // uncomment to see debug output
      // process.stderr.write(msg + '\n');
    });
    warningSpy.mockImplementation(msg => {
      // uncomment to debug
      // process.stderr.write('log:' + msg + '\n');
    });

    // @actions/exec
    getExecOutputSpy = jest.spyOn(exec, 'getExecOutput');
    getExecOutputSpy.mockImplementation(() => 'v16.20.2-nes');
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    //jest.restoreAllMocks();
  });

  afterAll(async () => {
    console.log('::stoptoken::'); // Re-enable executing of runner commands when running tests in actions
    jest.restoreAllMocks();
  }, 100000);

  //--------------------------------------------------
  // Found in cache tests
  //--------------------------------------------------

  it('finds version in cache and adds it to the path', async () => {
    inputs['node-version'] = '16.20.2-nes';
    inputs['nes-registry-token'] = 'faketoken';

    inSpy.mockImplementation(name => inputs[name]);

    const toolPath = path.normalize('/cache/node/16.20.2-nes/x64');
    findSpy.mockImplementation(() => toolPath);
    await main.run();

    const expPath = path.join(toolPath, 'bin');
    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${expPath}${osm.EOL}`);
  });

  it('handles unhandled find error and reports error', async () => {
    const errMsg = 'unhandled error message';
    inputs['node-version'] = '16.20.2-nes';
    inputs['nes-registry-token'] = 'faketoken';

    findSpy.mockImplementation(() => {
      throw new Error(errMsg);
    });

    await main.run();

    expect(cnSpy).toHaveBeenCalledWith('::error::' + errMsg + osm.EOL);
  });

  it('falls back to a version from node dist', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    const versionSpec = '16.20.2-nes';

    inputs['node-version'] = versionSpec;
    inputs['always-auth'] = false;
    inputs['nes-registry-token'] = 'faketoken';

    // ... but not in the local cache
    findSpy.mockImplementation(() => '');

    dlSpy.mockImplementation(async () => '/some/temp/path');
    const toolPath = path.normalize('/cache/node/16.20.2-nes/x64');
    exSpy.mockImplementation(async () => '/some/other/temp/path');
    cacheSpy.mockImplementation(async () => toolPath);

    await main.run();

    const expPath = path.join(toolPath, 'bin');

    expect(dlSpy).toHaveBeenCalled();
    expect(exSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Extracting ...');
    expect(logSpy).toHaveBeenCalledWith('Done');
    expect(cnSpy).toHaveBeenCalledWith(`::add-path::${expPath}${osm.EOL}`);
  });

  it('does not find a version that does not exist', async () => {
    os.platform = 'linux';
    os.arch = 'x64';

    const versionSpec = '16.20.0-nes';
    inputs['node-version'] = versionSpec;
    inputs['nes-registry-token'] = 'faketoken';

    findSpy.mockImplementation(() => '');
    await main.run();

    expect(cnSpy).toHaveBeenCalledWith(
      `::error::Unable to find Node version '${versionSpec}' for platform ${os.platform} and architecture ${os.arch}.${osm.EOL}`
    );
  });

  it('finds version in cache with stable true', async () => {
    inputs['node-version'] = '16-nes';
    inputs['nes-registry-token'] = 'faketoken';
    inputs.stable = 'true';

    const toolPath = path.normalize('/cache/node/16.20.2-nes/x64');
    findSpy.mockImplementation(() => toolPath);
    await main.run();

    expect(logSpy).toHaveBeenCalledWith(`Found in cache @ ${toolPath}`);
  });

  it('reports a failed download', async () => {
    const errMsg = 'unhandled download message';
    os.platform = 'linux';
    os.arch = 'x64';

    const versionSpec = '16.20.2-nes';

    inputs['node-version'] = versionSpec;
    inputs['always-auth'] = false;
    inputs['nes-registry-token'] = 'faketoken';

    findSpy.mockImplementation(() => '');
    findAllVersionsSpy.mockImplementation(() => []);
    dlSpy.mockImplementation(() => {
      throw new Error(errMsg);
    });
    await main.run();

    expect(cnSpy).toHaveBeenCalledWith(`::error::${errMsg}${osm.EOL}`);
  });

  it('acquires specified architecture of node', async () => {
    for (const {arch, version, osSpec} of [
      {arch: 'x64', version: '16.20.2-nes', osSpec: 'win32'},
      {arch: 'x64', version: '16.20.2-nes', osSpec: 'darwin'}
    ]) {
      os.platform = osSpec;
      os.arch = arch;
      const fileExtension = os.platform === 'win32' ? '7z' : 'tar.gz';
      const platform = {
        linux: 'linux',
        darwin: 'darwin',
        win32: 'win'
      }[os.platform];

      inputs['node-version'] = version;
      inputs['architecture'] = arch;
      inputs['always-auth'] = false;
      inputs['nes-registry-token'] = 'faketoken';

      const expectedUrl = `https://registry.dev.nes.herodevs.com/nodejs/nes/v${version}/node-v${version}-${platform}-${arch}.${fileExtension}`;

      // ... but not in the local cache
      findSpy.mockImplementation(() => '');
      findAllVersionsSpy.mockImplementation(() => []);

      dlSpy.mockImplementation(async () => '/some/temp/path');
      const toolPath = path.normalize(`/cache/node/${version}/${arch}`);
      exSpy.mockImplementation(async () => '/some/other/temp/path');
      cacheSpy.mockImplementation(async () => toolPath);

      await main.run();
      expect(dlSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        `Acquiring ${version} - ${arch} from ${expectedUrl}`
      );
    }
  }, 100000);

  describe('nes versions', () => {
    it.each([
      [
        '16.20.2-nes',
        '16.20.2-nes',
        'https://registry.dev.nes.herodevs.com/nodejs/nes/v16.20.2-nes/node-v16.20.2-nes-linux-x64.tar.gz',
        '16-nes'
      ]
    ])(
      'finds the versions in the index.json and installs it',
      async (input, expectedVersion, _) => {
        const toolPath = path.normalize(`/cache/node/${expectedVersion}/x64`);

        findSpy.mockImplementation(() => '');
        findAllVersionsSpy.mockImplementation(() => []);
        dlSpy.mockImplementation(async () => '/some/temp/path');
        exSpy.mockImplementation(async () => '/some/other/temp/path');
        cacheSpy.mockImplementation(async () => toolPath);

        inputs['node-version'] = input;
        inputs['nes-registry-token'] = 'faketoken';
        os['arch'] = 'x64';
        os['platform'] = 'linux';
        // act
        await main.run();

        // assert
        expect(logSpy).toHaveBeenCalledWith('Extracting ...');
        expect(logSpy).toHaveBeenCalledWith('Adding to the cache ...');
        expect(cnSpy).toHaveBeenCalledWith(
          `::add-path::${path.join(toolPath, 'bin')}${osm.EOL}`
        );
      }
    );

    it('throws an error if version is not found', async () => {
      const versionSpec = 'v19.0.0-nes';

      findSpy.mockImplementation(() => '');
      findAllVersionsSpy.mockImplementation(() => []);
      dlSpy.mockImplementation(async () => '/some/temp/path');
      exSpy.mockImplementation(async () => '/some/other/temp/path');

      inputs['node-version'] = versionSpec;
      os['arch'] = 'x64';
      os['platform'] = 'linux';
      inputs['nes-registry-token'] = 'faketoken';
      // act
      await main.run();

      // assert
      expect(cnSpy).toHaveBeenCalledWith(
        `::error::Unable to find Node version '${versionSpec}' for platform ${os.platform} and architecture ${os.arch}.${osm.EOL}`
      );
    });
  });
});
