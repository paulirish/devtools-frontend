// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Protocol from '../../generated/protocol.js';

import {Handlers, Helpers, type Types} from './trace.js';

export class EntityMapper {
  #handlerData: Handlers.Types.HandlerData;
  #entityMappings: Handlers.Helpers.EntityMappings;
  #firstPartyEntity: Handlers.Helpers.Entity|null;
  #thirdPartyEvents: Types.Events.Event[] = [];
  /**
   * When resolving urls and updating our entity mapping in the
   * SourceMapsResolver, a single call frame can appear multiple times
   * as different cpu profile nodes. To avoid duplicate work on the
   * same CallFrame, we can keep track of them.
   */
  #resolvedCallFrames: Set<Protocol.Runtime.CallFrame> = new Set();

  constructor(handlerData: Handlers.Types.HandlerData) {
    this.#handlerData = handlerData;
    this.#entityMappings = this.#initializeEntityMappings(this.#handlerData);
    this.#firstPartyEntity = this.#findFirstPartyEntity();
    this.#thirdPartyEvents = this.#getThirdPartyEvents();
  }

  /**
   * This initializes our maps using the handlerData data from both the RendererHandler and
   * the NetworkRequestsHandler.
   */
  #initializeEntityMappings(handlerData: Handlers.Types.HandlerData): Handlers.Helpers.EntityMappings {
    // NetworkRequestHandler caches.
    const entityByNetworkEvent = handlerData.NetworkRequests.entityMappings.entityByEvent;
    const networkEventsByEntity = handlerData.NetworkRequests.entityMappings.eventsByEntity;
    const networkCreatedCache = handlerData.NetworkRequests.entityMappings.createdEntityCache;

    // RendrerHandler caches.
    const entityByRendererEvent = handlerData.Renderer.entityMappings.entityByEvent;
    const rendererEventsByEntity = handlerData.Renderer.entityMappings.eventsByEntity;
    const rendererCreatedCache = handlerData.Renderer.entityMappings.createdEntityCache;

    // Build caches.
    const entityByEvent = new Map([...entityByNetworkEvent, ...entityByRendererEvent]);
    const createdEntityCache = new Map([...networkCreatedCache, ...rendererCreatedCache]);
    const eventsByEntity = this.#mergeEventsByEntities(rendererEventsByEntity, networkEventsByEntity);

    return {
      entityByEvent,
      eventsByEntity,
      createdEntityCache,
    };
  }

  #findFirstPartyEntity(): Handlers.Helpers.Entity|null {
    // As a starting point, we consider the first navigation as the 1P.
    const nav = Array.from(this.#handlerData.Meta.navigationsByNavigationId.values()).sort((a, b) => a.ts - b.ts)[0];
    const firstPartyUrl = nav?.args.data?.documentLoaderURL ?? this.#handlerData.Meta.mainFrameURL;
    if (!firstPartyUrl) {
      return null;
    }
    return Handlers.Helpers.getEntityForUrl(firstPartyUrl, this.#entityMappings.createdEntityCache) ?? null;
  }

  #getThirdPartyEvents(): Types.Events.Event[] {
    const entries = Array.from(this.#entityMappings.eventsByEntity.entries());
    const thirdPartyEvents = entries.flatMap(([entity, requests]) => {
      return entity.name !== this.#firstPartyEntity?.name ? requests : [];
    });
    return thirdPartyEvents;
  }

  #mergeEventsByEntities(
      a: Map<Handlers.Helpers.Entity, Types.Events.Event[]>,
      b: Map<Handlers.Helpers.Entity, Types.Events.Event[]>): Map<Handlers.Helpers.Entity, Types.Events.Event[]> {
    const merged = new Map(a);
    for (const [entity, events] of b.entries()) {
      if (merged.has(entity)) {
        const currentEvents = merged.get(entity) ?? [];
        merged.set(entity, [...currentEvents, ...events]);
      } else {
        merged.set(entity, [...events]);
      }
    }
    return merged;
  }

  /**
   * Returns an entity for a given event if any.
   */
  entityForEvent(event: Types.Events.Event): Handlers.Helpers.Entity|null {
    return this.#entityMappings.entityByEvent.get(event) ?? null;
  }

  /**
   * Returns trace events that correspond with a given entity if any.
   */
  eventsForEntity(entity: Handlers.Helpers.Entity): Types.Events.Event[] {
    return this.#entityMappings.eventsByEntity.get(entity) ?? [];
  }

  firstPartyEntity(): Handlers.Helpers.Entity|null {
    return this.#firstPartyEntity;
  }

  thirdPartyEvents(): Types.Events.Event[] {
    return this.#thirdPartyEvents;
  }

  mappings(): Handlers.Helpers.EntityMappings {
    return this.#entityMappings;
  }

  /**
   * This updates entity mapping given a callFrame and sourceURL (newly resolved),
   * updating both eventsByEntity and entityByEvent. The call frame provides us the
   * URL and sourcemap source location that events map to. This describes the exact events we
   * want to update. We then update the events with the new sourceURL.
   *
   * compiledURLs -> the actual file's url (e.g. my-big-bundle.min.js)
   * sourceURLs -> the resolved urls (e.g. react.development.js, my-app.ts)
   * @param callFrame
   * @param sourceURL
   */
  updateSourceMapEntities(callFrame: Protocol.Runtime.CallFrame, sourceURL: string): void {
    // Avoid the extra work, if we have already resolved this callFrame.
    if (this.#resolvedCallFrames.has(callFrame)) {
      return;
    }

    const compiledURL = callFrame.url;
    const currentEntity = Handlers.Helpers.getEntityForUrl(compiledURL, this.#entityMappings.createdEntityCache);
    const resolvedEntity = Handlers.Helpers.getEntityForUrl(sourceURL, this.#entityMappings.createdEntityCache);
    // If the entity changed, then we should update our caches. If we don't have a currentEntity,
    // we can't do much with that. Additionally without our current entity, we don't have a reference to the related
    // events so there are no relationships to be made.
    if ((resolvedEntity === currentEntity) || (!currentEntity || !resolvedEntity)) {
      return;
    }
    const currentEntityEvents = (currentEntity && this.#entityMappings.eventsByEntity.get(currentEntity)) ?? [];
    // The events of the entity that match said source location.
    const sourceLocationEvents: Types.Events.Event[] = [];
    // The events that don't match the source location, but that we should keep mapped to its current entity.
    const unrelatedEvents: Types.Events.Event[] = [];
    currentEntityEvents?.forEach(e => {
      const stackTrace = Helpers.Trace.getZeroIndexedStackTraceForEvent(e);
      const cf = stackTrace?.at(0);

      const matchesCallFrame = cf && Helpers.Trace.isMatchingCallFrame(cf, callFrame);
      if (matchesCallFrame) {
        sourceLocationEvents.push(e);
      } else {
        unrelatedEvents.push(e);
      }
    });
    // Update current entity.
    this.#entityMappings.eventsByEntity.set(currentEntity, unrelatedEvents);
    // Map the source location events to the new entity.
    this.#entityMappings.eventsByEntity.set(resolvedEntity, sourceLocationEvents);
    sourceLocationEvents.forEach(e => {
      this.#entityMappings.entityByEvent.set(e, resolvedEntity);
    });
    // Update our CallFrame cache when we've got a resolved entity.
    this.#resolvedCallFrames.add(callFrame);
  }
}
