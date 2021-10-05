// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import * as SDK from '../../../../../front_end/core/sdk/sdk.js';
import * as Lighthouse from '../../../../../front_end/panels/lighthouse/lighthouse.js';
import * as Protocol from '../../../../../front_end/generated/protocol.js';
import {createTarget} from '../../helpers/EnvironmentHelpers.js';
import {describeWithMockConnection} from '../../helpers/MockConnection.js';
import {initializeGlobalVars, deinitializeGlobalVars} from '../../helpers/EnvironmentHelpers.js';

const reports = [
  {
    id: 'some_id' as Protocol.Network.ReportId,
    initiatorUrl: 'https://example.com/script.js',
    destination: 'main-endpoint',
    type: 'deprecation',
    timestamp: 1632747042.12696,
    depth: 1,
    completedAttempts: 0,
    body: {
      columnNumber: 8,
      id: 'PrefixedStorageInfo',
      lineNumber: 15,
      message:
          '\'window.webkitStorageInfo\' is deprecated. Please use \'navigator.webkitTemporaryStorage\' or \'navigator.webkitPersistentStorage\' instead.',
      sourceFile: 'https://example.com/script.js',
    },
    status: Protocol.Network.ReportStatus.Queued,
  },
  {
    id: 'another_id' as Protocol.Network.ReportId,
    initiatorUrl: 'https://www.google.com/script.js',
    destination: 'default',
    type: 'csp-violation',
    timestamp: 1632747045.39856,
    depth: 1,
    completedAttempts: 0,
    body: {
      blockedURL: 'https://www.google.com/script.js',
      disposition: 'enforce',
      documentURL: 'https://www.google.com/document',
      effectiveDirective: 'script-src-elem',
      originalPolicy: 'script-src \'self\'; object-src \'none\'; report-to main-endpoint;',
      statusCode: 200,
    },
    status: Protocol.Network.ReportStatus.Queued,
  },
];

describeWithMockConnection('ReportingApiReportsView', () => {
  let networkManager: SDK.NetworkManager.NetworkManager|null;

  // before(async () => {
  //   await initializeGlobalVars({reset: false});
  // });
  // after(async () => {
  //   await deinitializeGlobalVars();
  // });

  it('can handle report updates', async () => {
    // if (!networkManager) {
    //   throw new Error('No networkManager');
    // }
    console.trace('******** OMG')
    console.log({controller: 1223424234233});
    // const {LighthouseController, LighthouseProtocolService} = Lighthouse;
    const protocolService = new Lighthouse.LighthouseProtocolService.ProtocolService();
    const controller = new Lighthouse.LighthouseController.LighthouseController(protocolService);
    console.log({controller: 123});

    const target = createTarget();
    networkManager = target.model(SDK.NetworkManager.NetworkManager);

    // const successReport = {
    //   id: 'some_id' as Protocol.Network.ReportId,
    //   initiatorUrl: 'https://example.com/script.js',
    //   destination: 'main-endpoint',
    //   type: 'deprecation',
    //   timestamp: 1632747042.12696,
    //   depth: 1,
    //   completedAttempts: 1,
    //   body: {
    //     columnNumber: 8,
    //     id: 'PrefixedStorageInfo',
    //     lineNumber: 15,
    //     message:
    //         '\'window.webkitStorageInfo\' is deprecated. Please use \'navigator.webkitTemporaryStorage\' or \'navigator.webkitPersistentStorage\' instead.',
    //     sourceFile: 'https://example.com/script.js',
    //   },
    //   status: Protocol.Network.ReportStatus.Success,
    // };

  });

});
