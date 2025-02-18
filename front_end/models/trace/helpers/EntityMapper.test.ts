// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {describeWithEnvironment} from '../../../testing/EnvironmentHelpers.js';
import {TraceLoader} from '../../../testing/TraceLoader.js';
import * as Trace from '../trace.js';

describeWithEnvironment('EntityMapper', function() {
  it('correctly merges handler data', async function() {
    const {parsedTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');

    const fromRenderer = new Map(parsedTrace.Renderer.entityMappings.eventsByEntity);
    const fromNetwork = new Map(parsedTrace.NetworkRequests.entityMappings.eventsByEntity);

    const mapper = parsedTrace.entity;
    const mappings = mapper.mappings();

    // [paulirish.com, Google Tag Manager, Google Fonts, Google Analytics, Disqus, Firebase]
    assert.deepEqual(mappings.eventsByEntity.size, 6);

    // Check that mappings.eventsByEntity includes all the events of RendererHandler.
    fromRenderer.entries().forEach(([entity, events]) => {
      assert.isTrue(mappings.eventsByEntity.has(entity));
      const gotEvents = mappings.eventsByEntity.get(entity) ?? [];
      events.forEach(e => {
        assert.isTrue(gotEvents.includes(e));
      });
    });

    // Check that mappings.eventsByEntity includes all the events of NetworkRequestsHandler.
    fromNetwork.entries().forEach(([entity, events]) => {
      assert.isTrue(mappings.eventsByEntity.has(entity));
      const gotEvents = mappings.eventsByEntity.get(entity) ?? [];
      events.forEach(e => {
        assert.isTrue(gotEvents.includes(e));
      });
    });

    // Additionally make sure they sum up.
    mappings.eventsByEntity.entries().forEach(([entity, events]) => {
      const eventsInNetwork = fromNetwork.get(entity) ?? [];
      const eventsInRenderer = fromRenderer.get(entity) ?? [];
      assert.deepEqual(events.length, eventsInNetwork.length + eventsInRenderer.length);
    });
  });

  describe('entityForEvent', () => {
    it('correctly contains network req entity mappings', async function() {
      const {parsedTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');
      const mapper = parsedTrace.entity;

      // Check entities for network requests.
      const reqs = parsedTrace.NetworkRequests.byOrigin.get('www.paulirish.com')?.all ?? [];
      let gotEntity = mapper.entityForEvent(reqs[0]);
      assert.deepEqual(gotEntity?.name, 'paulirish.com');

      const gstatic = parsedTrace.NetworkRequests.byOrigin.get('fonts.gstatic.com')?.all ?? [];
      gotEntity = mapper.entityForEvent(gstatic[0]);
      assert.deepEqual(gotEntity?.name, 'Google Fonts');
    });

    it('correctly contains main event entity mappings', async function() {
      const {parsedTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');
      const mapper = parsedTrace.entity;

      const funcCall = parsedTrace.Renderer.allTraceEntries.find(e => Trace.Types.Events.isFunctionCall(e));
      assert.exists(funcCall);

      // This function call should map to paulirish.com entity.
      const gotEntity = mapper.entityForEvent(funcCall);
      assert.deepEqual(gotEntity?.name, 'paulirish.com');
    });
  });
  describe('eventsForEntity', () => {
    it('correctly contains network req entity mappings', async function() {
      const {parsedTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');
      const mapper = parsedTrace.entity;

      const reqs = parsedTrace.NetworkRequests.byOrigin.get('www.paulirish.com')?.all ?? [];
      const entity = mapper.entityForEvent(reqs[0]);
      assert.exists(entity);
      assert.deepEqual(entity.name, 'paulirish.com');

      // Reqs should all be mapped to the correct entity.
      const gotEvents = mapper.eventsForEntity(entity);
      reqs.forEach(req => {
        assert.isTrue(gotEvents.includes(req));
      });
    });
  });
  describe('first party', () => {
    it('correctly captures the first party entity', async function() {
      const {parsedTrace: localhostTrace} = await TraceLoader.traceEngine(this, 'load-simple.json.gz');
      let mapper = localhostTrace.entity;
      let got = mapper.firstPartyEntity();
      assert.deepEqual(got?.name, 'localhost');

      const {parsedTrace: paulTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');
      mapper = paulTrace.entity;
      got = mapper.firstPartyEntity();
      assert.deepEqual(got?.name, 'paulirish.com');

      const {parsedTrace: webDevTrace} = await TraceLoader.traceEngine(this, 'web-dev.json.gz');
      mapper = webDevTrace.entity;
      got = mapper.firstPartyEntity();
      assert.deepEqual(got?.name, 'web.dev');
    });
    it('correctly captures 3p events', async function() {
      const {parsedTrace: paulTrace} = await TraceLoader.traceEngine(this, 'lantern/paul/trace.json.gz');
      const mapper = paulTrace.entity;
      const got = mapper.firstPartyEntity();
      assert.exists(got);
      assert.deepEqual(got.name, 'paulirish.com');
      const firstPartyEvents = mapper.eventsForEntity(got);
      const gotThirdPartyEvents = mapper.thirdPartyEvents();
      gotThirdPartyEvents.forEach(e => {
        assert.isTrue(!firstPartyEvents.includes(e));
      });
    });
  });
});
