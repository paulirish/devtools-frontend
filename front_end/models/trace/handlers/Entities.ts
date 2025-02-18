// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Protocol from '../../../generated/protocol.js';
import * as ThirdPartyWeb from '../../../third_party/third-party-web/third-party-web.js';
import * as Helpers from '../helpers/helpers.js';
import type * as Types from '../types/types.js';

import {getNonResolvedURL} from './helpers.js';
import type {HandlerData} from './types.js';

export type Entity = (typeof ThirdPartyWeb.ThirdPartyWeb.entities)[number]&{
  isUnrecognized?: boolean,
};

export interface EntityMappings {
  createdEntityCache: Map<string, Entity>;
  entityByEvent: Map<Types.Events.Event, Entity>;
  /**
   * This holds the entities that had to be created, because they were not found using the
   * ThirdPartyWeb database.
   */
  eventsByEntity: Map<Entity, Types.Events.Event[]>;
}

export class EntityMapper {
  #handlerData: HandlerData;
  #entityMappings: EntityMappings;
  #firstPartyEntity: Entity|null;
  #thirdPartyEvents: Types.Events.Event[] = [];
  /**
   * When resolving urls and updating our entity mapping in the
   * SourceMapsResolver, a single call frame can appear multiple times
   * as different cpu profile nodes. To avoid duplicate work on the
   * same CallFrame, we can keep track of them.
   */
  #resolvedCallFrames: Set<Protocol.Runtime.CallFrame> = new Set();

  constructor(handlerData: HandlerData) {
    this.#handlerData = handlerData;
    this.#entityMappings = this.#initializeEntityMappings(this.#handlerData);
    this.#firstPartyEntity = this.#findFirstPartyEntity();
    this.#thirdPartyEvents = this.#getThirdPartyEvents();
  }

  /**
   * This initializes our maps using the handlerData data from both the RendererHandler and
   * the NetworkRequestsHandler.
   */
  #initializeEntityMappings(handlerData: HandlerData): EntityMappings {
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

  #findFirstPartyEntity(): Entity|null {
    // As a starting point, we consider the first navigation as the 1P.
    const nav = Array.from(this.#handlerData.Meta.navigationsByNavigationId.values()).sort((a, b) => a.ts - b.ts)[0];
    const firstPartyUrl = nav?.args.data?.documentLoaderURL ?? this.#handlerData.Meta.mainFrameURL;
    if (!firstPartyUrl) {
      return null;
    }
    return getEntityForUrl(firstPartyUrl, this.#entityMappings.createdEntityCache) ?? null;
  }

  #getThirdPartyEvents(): Types.Events.Event[] {
    const entries = Array.from(this.#entityMappings.eventsByEntity.entries());
    const thirdPartyEvents = entries.flatMap(([entity, requests]) => {
      return entity.name !== this.#firstPartyEntity?.name ? requests : [];
    });
    return thirdPartyEvents;
  }

  #mergeEventsByEntities(a: Map<Entity, Types.Events.Event[]>, b: Map<Entity, Types.Events.Event[]>):
      Map<Entity, Types.Events.Event[]> {
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
  entityForEvent(event: Types.Events.Event): Entity|null {
    return this.#entityMappings.entityByEvent.get(event) ?? null;
  }

  /**
   * Returns trace events that correspond with a given entity if any.
   */
  eventsForEntity(entity: Entity): Types.Events.Event[] {
    return this.#entityMappings.eventsByEntity.get(entity) ?? [];
  }

  firstPartyEntity(): Entity|null {
    return this.#firstPartyEntity;
  }

  thirdPartyEvents(): Types.Events.Event[] {
    return this.#thirdPartyEvents;
  }

  mappings(): EntityMappings {
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
    const currentEntity = getEntityForUrl(compiledURL, this.#entityMappings.createdEntityCache);
    const resolvedEntity = getEntityForUrl(sourceURL, this.#entityMappings.createdEntityCache);
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

export function getEntityForEvent(event: Types.Events.Event, entityCache: Map<string, Entity>): Entity|undefined {
  const url = getNonResolvedURL(event);
  if (!url) {
    return;
  }
  return getEntityForUrl(url, entityCache);
}

export function getEntityForUrl(url: string, entityCache: Map<string, Entity>): Entity|undefined {
  return ThirdPartyWeb.ThirdPartyWeb.getEntity(url) ?? makeUpEntity(entityCache, url);
}

export function makeUpEntity(entityCache: Map<string, Entity>, url: string): Entity|undefined {
  if (url.startsWith('chrome-extension:')) {
    return makeUpChromeExtensionEntity(entityCache, url);
  }

  // Make up an entity only for valid http/https URLs.
  if (!url.startsWith('http')) {
    return;
  }

  // NOTE: Lighthouse uses a tld database to determine the root domain, but here
  // we are using third party web's database. Doesn't really work for the case of classifying
  // domains 3pweb doesn't know about, so it will just give us a guess.
  const rootDomain = ThirdPartyWeb.ThirdPartyWeb.getRootDomain(url);
  if (!rootDomain) {
    return;
  }

  if (entityCache.has(rootDomain)) {
    return entityCache.get(rootDomain);
  }

  const unrecognizedEntity = {
    name: rootDomain,
    company: rootDomain,
    category: '',
    categories: [],
    domains: [rootDomain],
    averageExecutionTime: 0,
    totalExecutionTime: 0,
    totalOccurrences: 0,
    isUnrecognized: true,
  };
  entityCache.set(rootDomain, unrecognizedEntity);
  return unrecognizedEntity;
}
function getChromeExtensionOrigin(url: URL): string {
  return url.protocol + '//' + url.host;
}
function makeUpChromeExtensionEntity(entityCache: Map<string, Entity>, url: string, extensionName?: string): Entity {
  const parsedUrl = new URL(url);
  const origin = getChromeExtensionOrigin(parsedUrl);
  const host = new URL(origin).host;
  const name = extensionName || host;

  const cachedEntity = entityCache.get(origin);
  if (cachedEntity) {
    return cachedEntity;
  }

  const chromeExtensionEntity = {
    name,
    company: name,
    category: 'Chrome Extension',
    homepage: 'https://chromewebstore.google.com/detail/' + host,
    categories: [],
    domains: [],
    averageExecutionTime: 0,
    totalExecutionTime: 0,
    totalOccurrences: 0,
  };

  entityCache.set(origin, chromeExtensionEntity);
  return chromeExtensionEntity;
}

export function addEventToEntityMapping(event: Types.Events.Event, entityMappings: EntityMappings): void {
  const entity = getEntityForEvent(event, entityMappings.createdEntityCache);
  if (!entity) {
    return;
  }

  const events = entityMappings.eventsByEntity.get(entity);
  if (events) {
    events.push(event);
  } else {
    entityMappings.eventsByEntity.set(entity, [event]);
  }

  entityMappings.entityByEvent.set(event, entity);
}
