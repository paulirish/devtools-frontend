// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Protocol from '../../../generated/protocol.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Helpers from '../helpers/helpers.js';
import type * as Lantern from '../lantern/lantern.js';
import * as Types from '../types/types.js';

import {
  InsightCategory,
  InsightKeys,
  type InsightModel,
  type InsightSetContext,
  type InsightSetContextWithNavigation,
  type PartialInsightModel,
  type RelatedEventsMap,
} from './types.js';

export const UIStrings = {
  /**
   * @description Title of an insight that recommends avoiding chaining critical requests.
   */
  title: 'Network dependency tree',
  /**
   * @description Description of an insight that recommends avoiding chaining critical requests.
   */
  description:
      '[Avoid chaining critical requests](https://developer.chrome.com/docs/lighthouse/performance/critical-request-chains) by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load.',
  /**
   * @description Description of the warning that recommends avoiding chaining critical requests.
   */
  warningDescription:
      'Avoid chaining critical requests by reducing the length of chains, reducing the download size of resources, or deferring the download of unnecessary resources to improve page load.',
  /**
   * @description Text status indicating that there isn't long chaining critical network requests.
   */
  noNetworkDependencyTree: 'No rendering tasks impacted by network dependencies',
  /**
   * @description Text for the maximum critical path latency. This refers to the longest chain of network requests that
   * the browser must download before it can render the page.
   */
  maxCriticalPathLatency: 'Max critical path latency:',
  /** Label for a column in a data table; entries will be the network request */
  columnRequest: 'Request',
  /** Label for a column in a data table; entries will be the time from main document till current network request. */
  columnTime: 'Time',
  /**
   * @description Title of the table of the detected preconnect origins.
   */
  preconnectOriginsTableTitle: 'Preconnected origins',
  /**
   * @description Description of the table of the detected preconnect origins.
   */
  preconnectOriginsTableDescription:
      '[preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints help the browser establish a connection earlier in the page load, saving time when the first request for that origin is made. The following are the origins that the page preconnected to.',
  /**
   * @description Text status indicating that there isn't any preconnected origins.
   */
  noPreconnectOrigins: 'no origins were preconnected',
  /**
   * @description A warning message that is shown when found more than 4 preconnected links. "preconnect" should not be translated.
   */
  tooManyPreconnectLinksWarning:
      'More than 4 `preconnect` connections were found. These should be used sparingly and only to the most important origins.',
  /**
   * @description A warning message that is shown when the user added preconnect for some unnecessary origins. "preconnect" should not be translated.
   */
  unusedWarning: 'Unused preconnect. Only use `preconnect` for origins that the page is likely to request.',
  /**
   * @description A warning message that is shown when the user forget to set the `crossorigin` HTML attribute, or setting it to an incorrect value, on the link is a common mistake when adding preconnect links. "preconnect" should not be translated.
   * */
  crossoriginWarning: 'Unused preconnect. Check that the `crossorigin` attribute is used properly.',
  /**
   * @description Label for a column in a data table; entries will be the source of the origin.
   */
  columnSource: 'Source',
  /**
   * @description Text status indicating that there isn't preconnect candidates.
   */
  noPreconnectCandidates: 'No additional origins are good candidates for preconnecting',
  /**
   * @description Title of the table that shows the origins that the page should have preconnected to.
   */
  estSavingTableTitle: 'Preconnect candidates',
  /**
   * @description Description of the table that recommends preconnecting to the origins to save time. "preconnect" should not be translated.
   */
  estSavingTableDescription:
      'Add [preconnect](https://developer.chrome.com/docs/lighthouse/performance/uses-rel-preconnect/) hints to your most important origins, but try to use no more than 4.',
  /**
   * @description Label for a column in a data table; entries will be the origin of a web resource
   */
  columnOrigin: 'Origin',
  /**
   * @description Label for a column in a data table; entries will be the number of milliseconds the user could reduce page load by if they implemented the suggestions.
   */
  columnWastedMs: 'Est LCP savings',
} as const;

const str_ = i18n.i18n.registerUIStrings('models/trace/insights/NetworkDependencyTree.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

// XHRs are fetched at High priority, but we exclude them, as they are unlikely to be critical
// Images are also non-critical.
const nonCriticalResourceTypes = new Set<Protocol.Network.ResourceType>([
  Protocol.Network.ResourceType.Image,
  Protocol.Network.ResourceType.XHR,
  Protocol.Network.ResourceType.Fetch,
  Protocol.Network.ResourceType.EventSource,
]);

// Preconnect establishes a "clean" socket. Chrome's socket manager will keep an unused socket
// around for 10s. Meaning, the time delta between processing preconnect a request should be <10s,
// otherwise it's wasted. We add a 5s margin so we are sure to capture all key requests.
// @see https://github.com/GoogleChrome/lighthouse/issues/3106#issuecomment-333653747
const PRECONNECT_SOCKET_MAX_IDLE_IN_MS = Types.Timing.Milli(15_000);

const IGNORE_THRESHOLD_IN_MILLISECONDS = Types.Timing.Milli(50);

export const TOO_MANY_PRECONNECTS_THRESHOLD = 4;

export interface CriticalRequestNode {
  request: Types.Events.SyntheticNetworkRequest;
  timeFromInitialRequest: Types.Timing.Micro;
  children: CriticalRequestNode[];
  isLongest?: boolean;
  // Store all the requests that appear in any chains this request appears in.
  // Use set to avoid duplication.
  relatedRequests: Set<Types.Events.SyntheticNetworkRequest>;
}

export type PreconnectedOrigin = PreconnectedOriginFromDom|PreconnectedOriginFromResponseHeader;

export interface PreconnectedOriginFromDom {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  node_id: Protocol.DOM.BackendNodeId;
  frame?: string;
  url: string;
  unused: boolean;
  crossorigin: boolean;
  source: 'DOM';
}

export interface PreconnectedOriginFromResponseHeader {
  url: string;
  headerText: string;
  request: Types.Events.SyntheticNetworkRequest;
  unused: boolean;
  crossorigin: boolean;
  source: 'ResponseHeader';
}

export interface PreconnectCandidate {
  origin: Platform.DevToolsPath.UrlString;
  wastedMs: Types.Timing.Milli;
}

export type NetworkDependencyTreeInsightModel = InsightModel<typeof UIStrings, {
  rootNodes: CriticalRequestNode[],
  maxTime: Types.Timing.Micro,
  fail: boolean,
  preconnectedOrigins: PreconnectedOrigin[],
  preconnectCandidates: PreconnectCandidate[],
}>;

function finalize(partialModel: PartialInsightModel<NetworkDependencyTreeInsightModel>):
    NetworkDependencyTreeInsightModel {
  return {
    insightKey: InsightKeys.NETWORK_DEPENDENCY_TREE,
    strings: UIStrings,
    title: i18nString(UIStrings.title),
    description: i18nString(UIStrings.description),
    category: InsightCategory.LCP,
    state: partialModel.fail ? 'fail' : 'pass',
    ...partialModel,
  };
}

function isCritical(request: Types.Events.SyntheticNetworkRequest, context: InsightSetContextWithNavigation): boolean {
  // The main resource is always critical.
  if (request.args.data.requestId === context.navigationId) {
    return true;
  }

  // Treat any preloaded resource as non-critical
  if (request.args.data.isLinkPreload) {
    return false;
  }

  // Iframes are considered High Priority but they are not render blocking
  const isIframe = request.args.data.resourceType === Protocol.Network.ResourceType.Document &&
      request.args.data.frame !== context.frameId;

  if (nonCriticalResourceTypes.has(request.args.data.resourceType) || isIframe ||
      // Treat any missed images, primarily favicons, as non-critical resources
      request.args.data.mimeType.startsWith('image/')) {
    return false;
  }

  // Requests that have no initiatorRequest are typically ambiguous late-load assets.
  // Even on the off chance they were important, we don't have any parent to display for them.
  const initiatorUrl =
      request.args.data.initiator?.url || Helpers.Trace.getZeroIndexedStackTraceInEventPayload(request)?.at(0)?.url;
  if (!initiatorUrl) {
    return false;
  }

  const isBlocking = Helpers.Network.isSyntheticNetworkRequestEventRenderBlocking(request);
  const isHighPriority = Helpers.Network.isSyntheticNetworkRequestHighPriority(request);
  return isHighPriority || isBlocking;
}

function findMaxLeafNode(node: CriticalRequestNode): CriticalRequestNode {
  if (node.children.length === 0) {
    return node;
  }
  let maxLeaf = node.children[0];
  for (const child of node.children) {
    const leaf = findMaxLeafNode(child);
    if (leaf.timeFromInitialRequest > maxLeaf.timeFromInitialRequest) {
      maxLeaf = leaf;
    }
  }
  return maxLeaf;
}

function sortRecursively(nodes: CriticalRequestNode[]): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      node.children.sort((nodeA, nodeB) => {
        const leafA = findMaxLeafNode(nodeA);
        const leafB = findMaxLeafNode(nodeB);
        return leafB.timeFromInitialRequest - leafA.timeFromInitialRequest;
      });
      sortRecursively(node.children);
    }
  }
}

function generateNetworkDependencyTree(context: InsightSetContextWithNavigation): {
  rootNodes: CriticalRequestNode[],
  maxTime: Types.Timing.Micro,
  fail: boolean,
  relatedEvents?: RelatedEventsMap,
} {
  const rootNodes: CriticalRequestNode[] = [];
  const relatedEvents: RelatedEventsMap = new Map();
  let maxTime = Types.Timing.Micro(0);
  let fail = false;

  let longestChain: Types.Events.SyntheticNetworkRequest[] = [];

  function addChain(path: Types.Events.SyntheticNetworkRequest[]): void {
    if (path.length === 0) {
      return;
    }
    if (path.length >= 2) {
      fail = true;
    }
    const initialRequest = path[0];
    const lastRequest = path[path.length - 1];
    const totalChainTime = Types.Timing.Micro(lastRequest.ts + lastRequest.dur - initialRequest.ts);
    if (totalChainTime > maxTime) {
      maxTime = totalChainTime;
      longestChain = path;
    }

    let currentNodes = rootNodes;

    for (let depth = 0; depth < path.length; ++depth) {
      const request = path[depth];
      // find the request
      let found = currentNodes.find(node => node.request === request);

      if (!found) {
        const timeFromInitialRequest = Types.Timing.Micro(request.ts + request.dur - initialRequest.ts);
        found = {
          request,
          timeFromInitialRequest,
          children: [],
          relatedRequests: new Set(),
        };
        currentNodes.push(found);
      }

      path.forEach(request => found?.relatedRequests.add(request));

      // TODO(b/372897712): When RelatedInsight supports markdown, remove
      // UIStrings.warningDescription and use UIStrings.description.
      relatedEvents.set(request, depth < 2 ? [] : [i18nString(UIStrings.warningDescription)]);

      currentNodes = found.children;
    }
  }
  // By default `traverse` will discover nodes in BFS-order regardless of dependencies, but
  // here we need traversal in a topological sort order. We'll visit a node only when its
  // dependencies have been met.
  const seenNodes = new Set<Lantern.Graph.Node<Types.Events.SyntheticNetworkRequest>>();
  function getNextNodes(node: Lantern.Graph.Node<Types.Events.SyntheticNetworkRequest>):
      Array<Lantern.Graph.Node<Types.Events.SyntheticNetworkRequest>> {
    return node.getDependents().filter(n => n.getDependencies().every(d => seenNodes.has(d)));
  }

  context.lantern?.graph.traverse((node, traversalPath) => {
    seenNodes.add(node);
    if (node.type !== 'network') {
      return;
    }
    const networkNode = node;
    if (!isCritical(networkNode.rawRequest, context)) {
      return;
    }

    const networkPath = traversalPath.filter(node => node.type === 'network').reverse().map(node => node.rawRequest);

    // Ignore if some ancestor is not a critical request.
    if (networkPath.some(request => (!isCritical(request, context)))) {
      return;
    }

    // Ignore non-network things (like data urls).
    if (node.isNonNetworkProtocol) {
      return;
    }

    addChain(networkPath);
  }, getNextNodes);

  // Mark the longest chain
  if (longestChain.length > 0) {
    let currentNodes = rootNodes;
    for (const request of longestChain) {
      const found = currentNodes.find(node => node.request === request);
      if (found) {
        found.isLongest = true;
        currentNodes = found.children;
      } else {
        console.error('Some request in the longest chain is not found');
      }
    }
  }

  sortRecursively(rootNodes);

  return {
    rootNodes,
    maxTime,
    fail,
    relatedEvents,
  };
}

function getSecurityOrigin(url: string): Platform.DevToolsPath.UrlString {
  const parsedURL = new ParsedURL(url);
  return parsedURL.securityOrigin();
}

function handleLinkResponseHeaderPart(trimmedPart: string): {url: string, headerText: string}|null {
  if (!trimmedPart) {
    // Skip empty string
    return null;
  }

  // Extract URL
  const urlStart = trimmedPart.indexOf('<');
  const urlEnd = trimmedPart.indexOf('>');

  if (urlStart !== 0 || urlEnd === -1 || urlEnd <= urlStart) {
    // Skip parts without a valid URI (must start with '<' and have a closing '>')
    return null;
  }

  const url = trimmedPart.substring(urlStart + 1, urlEnd).trim();
  if (!url) {
    // Skip empty url
    return null;
  }

  // Extract parameters string (everything after '>')
  const paramsString = trimmedPart.substring(urlEnd + 1).trim();

  if (paramsString) {
    const params = paramsString.split(';');

    for (const param of params) {
      const trimmedParam = param.trim();
      if (!trimmedParam) {
        continue;
      }

      const eqIndex = trimmedParam.indexOf('=');
      if (eqIndex === -1) {
        // Skip malformed parameters without an '='
        continue;
      }

      const paramName = trimmedParam.substring(0, eqIndex).trim().toLowerCase();
      let paramValue = trimmedParam.substring(eqIndex + 1).trim();

      // Remove quotes from value if present
      if (paramValue.startsWith('"') && paramValue.endsWith('"')) {
        paramValue = paramValue.substring(1, paramValue.length - 1);
      }

      if (paramName === 'rel' && paramValue === 'preconnect') {
        // Found 'rel=preconnect', no need to process other parameters for this link
        return {url, headerText: trimmedPart};
      }
    }
  }
  return null;
}

/**
 * Parses an HTTP Link header string into an array of url and related header text.
 *
 * Export the function for test purpose.
 * @param linkHeaderValue The value of the HTTP Link header (e.g., '</style.css>; rel=preload; as=style, <https://example.com>; rel="preconnect"').
 * @returns An array of url and header text objects if it contains `rel=preconnect`.
 */
export function handleLinkResponseHeader(linkHeaderValue: string): Array<{url: string, headerText: string}> {
  if (!linkHeaderValue) {
    return [];
  }
  const preconnectedOrigins: Array<{url: string, headerText: string}> = [];

  // const headerTextParts = linkHeaderValue.split(',');

  for (let i = 0; i < linkHeaderValue.length;) {
    const firstUrlEnd = linkHeaderValue.indexOf('>', i);
    const commaIndex = linkHeaderValue.indexOf(',', firstUrlEnd);
    const partEnd = commaIndex !== -1 ? commaIndex : linkHeaderValue.length;
    const part = linkHeaderValue.substring(i, partEnd);

    i = partEnd + 1;

    const preconnectedOrigin = handleLinkResponseHeaderPart(part.trim());
    if (preconnectedOrigin) {
      preconnectedOrigins.push(preconnectedOrigin);
    }
  }

  return preconnectedOrigins;
}

// Export the function for test purpose.
export function generatePreconnectedOrigins(
    parsedTrace: Handlers.Types.ParsedTrace, context: InsightSetContextWithNavigation,
    contextRequests: Types.Events.SyntheticNetworkRequest[],
    preconnectCandidates: PreconnectCandidate[]): PreconnectedOrigin[] {
  const preconnectedOrigins: PreconnectedOrigin[] = [];
  for (const event of parsedTrace.NetworkRequests.linkPreconnectEvents) {
    preconnectedOrigins.push({
      node_id: event.args.data.node_id,
      frame: event.args.data.frame,
      url: event.args.data.url,
      // For each origin the page wanted to preconnect to:
      // - if we found no network requests to that origin at all then we issue a unused warning
      unused: !contextRequests.some(
          request => getSecurityOrigin(event.args.data.url) === getSecurityOrigin(request.args.data.url)),
      // - else (we found network requests to the same origin) and if some of those network requests is too slow (if
      //   they are preconnect candidates), then we issue a unused warning with crossorigin hint
      crossorigin: preconnectCandidates.some(candidate => candidate.origin === getSecurityOrigin(event.args.data.url)),
      source: 'DOM',
    });
  }

  const documentRequest = parsedTrace.NetworkRequests.byId.get(context.navigationId);
  documentRequest?.args.data.responseHeaders?.forEach(header => {
    if (header.name.toLowerCase() === 'link') {
      const preconnectedOriginsFromResponseHeader = handleLinkResponseHeader(header.value);  // , documentRequest);
      preconnectedOriginsFromResponseHeader?.forEach(origin => preconnectedOrigins.push({
        url: origin.url,
        headerText: origin.headerText,
        request: documentRequest,
        // For each origin the page wanted to preconnect to:
        // - if we found no network requests to that origin at all then we issue a unused warning
        unused: !contextRequests.some(
            request => getSecurityOrigin(origin.url) === getSecurityOrigin(request.args.data.url)),
        // - else (we found network requests to the same origin) and if some of those network requests is too slow (if
        //   they are preconnect candidates), then we issue a unused warning with crossorigin hint
        crossorigin: preconnectCandidates.some(candidate => candidate.origin === getSecurityOrigin(origin.url)),
        source: 'ResponseHeader',
      }));
    }
  });

  return preconnectedOrigins;
}

function hasValidTiming(request: Types.Events.SyntheticNetworkRequest): boolean {
  return !!request.args.data.timing && request.args.data.timing.connectEnd >= 0 &&
      request.args.data.timing.connectStart >= 0;
}

function hasAlreadyConnectedToOrigin(request: Types.Events.SyntheticNetworkRequest): boolean {
  const {timing} = request.args.data;
  if (!timing) {
    return false;
  }

  // When these values are given as -1, that means the page has
  // a connection for this origin and paid these costs already.
  if (timing.dnsStart === -1 && timing.dnsEnd === -1 && timing.connectStart === -1 && timing.connectEnd === -1) {
    return true;
  }

  // Less understood: if the connection setup took no time at all, consider
  // it the same as the above. It is unclear if this is correct, or is even possible.
  if (timing.dnsEnd - timing.dnsStart === 0 && timing.connectEnd - timing.connectStart === 0) {
    return true;
  }

  return false;
}

function socketStartTimeIsBelowThreshold(
    request: Types.Events.SyntheticNetworkRequest, mainResource: Types.Events.SyntheticNetworkRequest): boolean {
  const timeSinceMainEnd =
      Math.max(0, request.args.data.syntheticData.sendStartTime - mainResource.args.data.syntheticData.finishTime) as
      Types.Timing.Micro;
  return Helpers.Timing.microToMilli(timeSinceMainEnd) < PRECONNECT_SOCKET_MAX_IDLE_IN_MS;
}

function candidateRequestsByOrigin(
    parsedTrace: Handlers.Types.ParsedTrace, mainResource: Types.Events.SyntheticNetworkRequest,
    contextRequests: Types.Events.SyntheticNetworkRequest[],
    lcpGraphURLs: Set<string>): Map<string, Types.Events.SyntheticNetworkRequest[]> {
  const origins = new Map<string, Types.Events.SyntheticNetworkRequest[]>();

  contextRequests.forEach(request => {
    if (!hasValidTiming(request)) {
      return;
    }

    // Filter out all resources that are loaded by the document. Connections are already early.
    if (parsedTrace.NetworkRequests.eventToInitiator.get(request) === mainResource) {
      return;
    }

    const url = new URL(request.args.data.url);
    // Filter out urls that do not have an origin (data, file, etc).
    if (url.origin === 'null') {
      return;
    }
    const mainOrigin = new URL(mainResource.args.data.url).origin;
    // Filter out all resources that have the same origin. We're already connected.
    if (url.origin === mainOrigin) {
      return;
    }

    // Filter out anything that wasn't part of LCP. Only recommend important origins.
    if (!lcpGraphURLs.has(request.args.data.url)) {
      return;
    }
    // Filter out all resources where origins are already resolved.
    if (hasAlreadyConnectedToOrigin(request)) {
      return;
    }
    // Make sure the requests are below the PRECONNECT_SOCKET_MAX_IDLE_IN_MS (15s) mark.
    if (!socketStartTimeIsBelowThreshold(request, mainResource)) {
      return;
    }

    const originRequests = Platform.MapUtilities.getWithDefault(origins, url.origin, () => []);
    originRequests.push(request);
  });

  return origins;
}

// Export the function for test purpose.
export function generatePreconnectCandidates(
    parsedTrace: Handlers.Types.ParsedTrace, context: InsightSetContextWithNavigation,
    contextRequests: Types.Events.SyntheticNetworkRequest[]): PreconnectCandidate[] {
  if (!context.lantern) {
    return [];
  }

  const documentRequest = parsedTrace.NetworkRequests.byId.get(context.navigationId);
  if (!documentRequest) {
    return [];
  }

  const {rtt, additionalRttByOrigin} = context.lantern.simulator.getOptions();
  const lcpGraph = context.lantern.metrics.largestContentfulPaint.pessimisticGraph;
  const fcpGraph = context.lantern.metrics.firstContentfulPaint.pessimisticGraph;
  const lcpGraphURLs = new Set<string>();
  lcpGraph.traverse(node => {
    if (node.type === 'network') {
      lcpGraphURLs.add(node.request.url);
    }
  });
  const fcpGraphURLs = new Set<string>();
  fcpGraph.traverse(node => {
    if (node.type === 'network') {
      fcpGraphURLs.add(node.request.url);
    }
  });

  const groupedOrigins = candidateRequestsByOrigin(parsedTrace, documentRequest, contextRequests, lcpGraphURLs);

  let maxWastedLcp = Types.Timing.Milli(0);
  let maxWastedFcp = Types.Timing.Milli(0);
  let preconnectCandidates: PreconnectCandidate[] = [];

  groupedOrigins.forEach(requests => {
    const firstRequestOfOrigin = requests[0];

    // Skip the origin if we don't have timing information
    if (!firstRequestOfOrigin.args.data.timing) {
      return;
    }

    const firstRequestOfOriginParsedURL = new ParsedURL(firstRequestOfOrigin.args.data.url);
    const origin = firstRequestOfOriginParsedURL.securityOrigin();

    // Approximate the connection time with the duration of TCP (+potentially SSL) handshake
    // DNS time can be large but can also be 0 if a commonly used origin that's cached, so make
    // no assumption about DNS.
    const additionalRtt = additionalRttByOrigin.get(origin) ?? 0;
    let connectionTime = Types.Timing.Milli(rtt + additionalRtt);
    // TCP Handshake will be at least 2 RTTs for TLS connections
    if (firstRequestOfOriginParsedURL.scheme === 'https') {
      connectionTime = Types.Timing.Milli(connectionTime * 2);
    }

    const timeBetweenMainResourceAndDnsStart = Types.Timing.Micro(
        firstRequestOfOrigin.args.data.syntheticData.sendStartTime -
        documentRequest.args.data.syntheticData.finishTime +
        Helpers.Timing.milliToMicro(firstRequestOfOrigin.args.data.timing.dnsStart));
    const wastedMs =
        Math.min(connectionTime, Helpers.Timing.microToMilli(timeBetweenMainResourceAndDnsStart)) as Types.Timing.Milli;
    if (wastedMs < IGNORE_THRESHOLD_IN_MILLISECONDS) {
      return;
    }

    maxWastedLcp = Math.max(wastedMs, maxWastedLcp) as Types.Timing.Milli;

    if (fcpGraphURLs.has(firstRequestOfOrigin.args.data.url)) {
      maxWastedFcp = Math.max(wastedMs, maxWastedFcp) as Types.Timing.Milli;
    }
    preconnectCandidates.push({
      origin,
      wastedMs,
    });
  });

  preconnectCandidates = preconnectCandidates.sort((a, b) => b.wastedMs - a.wastedMs);

  return preconnectCandidates.slice(0, TOO_MANY_PRECONNECTS_THRESHOLD);
}

export function generateInsight(
    parsedTrace: Handlers.Types.ParsedTrace, context: InsightSetContext): NetworkDependencyTreeInsightModel {
  if (!context.navigation) {
    return finalize({
      rootNodes: [],
      maxTime: 0 as Types.Timing.Micro,
      fail: false,
      preconnectedOrigins: [],
      preconnectCandidates: [],
    });
  }

  const {
    rootNodes,
    maxTime,
    fail,
    relatedEvents,
  } = generateNetworkDependencyTree(context);

  const isWithinContext = (event: Types.Events.Event): boolean => Helpers.Timing.eventIsInBounds(event, context.bounds);
  const contextRequests = parsedTrace.NetworkRequests.byTime.filter(isWithinContext);

  const preconnectCandidates = generatePreconnectCandidates(parsedTrace, context, contextRequests);

  const preconnectedOrigins = generatePreconnectedOrigins(parsedTrace, context, contextRequests, preconnectCandidates);

  return finalize({
    rootNodes,
    maxTime,
    fail,
    relatedEvents,
    preconnectedOrigins,
    preconnectCandidates,
  });
}

// the rest of this file is copied from core/common/common.js, which can't be bundled right now.

/**
 * http://tools.ietf.org/html/rfc3986#section-5.2.4
 */
export function normalizePath(path: string): string {
  if (path.indexOf('..') === -1 && path.indexOf('.') === -1) {
    return path;
  }

  // Remove leading slash (will be added back below) so we
  // can handle all (including empty) segments consistently.
  const segments = (path[0] === '/' ? path.substring(1) : path).split('/');
  const normalizedSegments = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    } else if (segment === '..') {
      normalizedSegments.pop();
    } else {
      normalizedSegments.push(segment);
    }
  }
  let normalizedPath = normalizedSegments.join('/');
  if (path[0] === '/' && normalizedPath) {
    normalizedPath = '/' + normalizedPath;
  }
  if (normalizedPath[normalizedPath.length - 1] !== '/' &&
      ((path[path.length - 1] === '/') || (segments[segments.length - 1] === '.') ||
       (segments[segments.length - 1] === '..'))) {
    normalizedPath = normalizedPath + '/';
  }

  return normalizedPath;
}

export function schemeIs(url: Platform.DevToolsPath.UrlString, scheme: string): boolean {
  try {
    return (new URL(url)).protocol === scheme;
  } catch {
    return false;
  }
}

/**
 * File paths in DevTools that are represented either as unencoded absolute or relative paths, or encoded paths, or URLs.
 * @example
 * RawPathString: “/Hello World/file.js”
 * EncodedPathString: “/Hello%20World/file.js”
 * UrlString: “file:///Hello%20World/file/js”
 */
type BrandedPathString =
    Platform.DevToolsPath.UrlString|Platform.DevToolsPath.RawPathString|Platform.DevToolsPath.EncodedPathString;

export class ParsedURL {
  isValid: boolean;
  url: string;
  scheme: string;
  user: string;
  host: string;
  port: string;
  path: string;
  queryParams: string;
  fragment: string;
  folderPathComponents: string;
  lastPathComponent: string;
  readonly blobInnerScheme: string|undefined;

  constructor(url: string) {
    this.isValid = false;
    this.url = url;
    this.scheme = '';
    this.user = '';
    this.host = '';
    this.port = '';
    this.path = '';
    this.queryParams = '';
    this.fragment = '';
    this.folderPathComponents = '';
    this.lastPathComponent = '';

    const isBlobUrl = this.url.startsWith('blob:');
    const urlToMatch = isBlobUrl ? url.substring(5) : url;
    const match = urlToMatch.match(ParsedURL.urlRegex());
    if (match) {
      this.isValid = true;
      if (isBlobUrl) {
        this.blobInnerScheme = match[2].toLowerCase();
        this.scheme = 'blob';
      } else {
        this.scheme = match[2].toLowerCase();
      }
      this.user = match[3] ?? '';
      this.host = match[4] ?? '';
      this.port = match[5] ?? '';
      this.path = match[6] ?? '/';
      this.queryParams = match[7] ?? '';
      this.fragment = match[8] ?? '';
    } else {
      if (this.url.startsWith('data:')) {
        this.scheme = 'data';
        return;
      }
      if (this.url.startsWith('blob:')) {
        this.scheme = 'blob';
        return;
      }
      if (this.url === 'about:blank') {
        this.scheme = 'about';
        return;
      }
      this.path = this.url;
    }

    const lastSlashExceptTrailingIndex = this.path.lastIndexOf('/', this.path.length - 2);
    if (lastSlashExceptTrailingIndex !== -1) {
      this.lastPathComponent = this.path.substring(lastSlashExceptTrailingIndex + 1);
    } else {
      this.lastPathComponent = this.path;
    }
    const lastSlashIndex = this.path.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      this.folderPathComponents = this.path.substring(0, lastSlashIndex);
    }
  }

  static fromString(string: string): ParsedURL|null {
    const parsedURL = new ParsedURL(string.toString());
    if (parsedURL.isValid) {
      return parsedURL;
    }
    return null;
  }

  static preEncodeSpecialCharactersInPath(path: string): string {
    // Based on net::FilePathToFileURL. Ideally we would handle
    // '\\' as well on non-Windows file systems.
    for (const specialChar of ['%', ';', '#', '?', ' ']) {
      (path) = path.replaceAll(specialChar, encodeURIComponent(specialChar));
    }
    return path;
  }

  static rawPathToEncodedPathString(path: Platform.DevToolsPath.RawPathString):
      Platform.DevToolsPath.EncodedPathString {
    const partiallyEncoded = ParsedURL.preEncodeSpecialCharactersInPath(path);
    if (path.startsWith('/')) {
      return new URL(partiallyEncoded, 'file:///').pathname as Platform.DevToolsPath.EncodedPathString;
    }
    // URL prepends a '/'
    return new URL('/' + partiallyEncoded, 'file:///').pathname.substr(1) as Platform.DevToolsPath.EncodedPathString;
  }

  /**
   * @param name Must not be encoded
   */
  static encodedFromParentPathAndName(parentPath: Platform.DevToolsPath.EncodedPathString, name: string):
      Platform.DevToolsPath.EncodedPathString {
    return ParsedURL.concatenate(parentPath, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
  }

  /**
   * @param name Must not be encoded
   */
  static urlFromParentUrlAndName(parentUrl: Platform.DevToolsPath.UrlString, name: string):
      Platform.DevToolsPath.UrlString {
    return ParsedURL.concatenate(parentUrl, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
  }

  static encodedPathToRawPathString(encPath: Platform.DevToolsPath.EncodedPathString):
      Platform.DevToolsPath.RawPathString {
    return decodeURIComponent(encPath) as Platform.DevToolsPath.RawPathString;
  }

  static rawPathToUrlString(fileSystemPath: Platform.DevToolsPath.RawPathString): Platform.DevToolsPath.UrlString {
    let preEncodedPath: string = ParsedURL.preEncodeSpecialCharactersInPath(
        fileSystemPath.replace(/\\/g, '/') as Platform.DevToolsPath.RawPathString);
    preEncodedPath = preEncodedPath.replace(/\\/g, '/');
    if (!preEncodedPath.startsWith('file://')) {
      if (preEncodedPath.startsWith('/')) {
        preEncodedPath = 'file://' + preEncodedPath;
      } else {
        preEncodedPath = 'file:///' + preEncodedPath;
      }
    }
    return new URL(preEncodedPath).toString() as Platform.DevToolsPath.UrlString;
  }

  static relativePathToUrlString(
      relativePath: Platform.DevToolsPath.RawPathString,
      baseURL: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString {
    const preEncodedPath: string = ParsedURL.preEncodeSpecialCharactersInPath(
        relativePath.replace(/\\/g, '/') as Platform.DevToolsPath.RawPathString);
    return new URL(preEncodedPath, baseURL).toString() as Platform.DevToolsPath.UrlString;
  }

  static urlToRawPathString(fileURL: Platform.DevToolsPath.UrlString, isWindows?: boolean):
      Platform.DevToolsPath.RawPathString {
    console.assert(fileURL.startsWith('file://'), 'This must be a file URL.');
    const decodedFileURL = decodeURIComponent(fileURL);
    if (isWindows) {
      return decodedFileURL.substr('file:///'.length).replace(/\//g, '\\') as Platform.DevToolsPath.RawPathString;
    }
    return decodedFileURL.substr('file://'.length) as Platform.DevToolsPath.RawPathString;
  }

  static sliceUrlToEncodedPathString(url: Platform.DevToolsPath.UrlString, start: number):
      Platform.DevToolsPath.EncodedPathString {
    return url.substring(start) as Platform.DevToolsPath.EncodedPathString;
  }

  static substr<DevToolsPathType extends BrandedPathString>(
      devToolsPath: DevToolsPathType, from: number, length?: number): DevToolsPathType {
    return devToolsPath.substr(from, length) as DevToolsPathType;
  }

  static substring<DevToolsPathType extends BrandedPathString>(
      devToolsPath: DevToolsPathType, start: number, end?: number): DevToolsPathType {
    return devToolsPath.substring(start, end) as DevToolsPathType;
  }

  static prepend<DevToolsPathType extends BrandedPathString>(prefix: string, devToolsPath: DevToolsPathType):
      DevToolsPathType {
    return prefix + devToolsPath as DevToolsPathType;
  }

  static concatenate<DevToolsPathType extends BrandedPathString>(
      devToolsPath: DevToolsPathType, ...appendage: string[]): DevToolsPathType {
    return devToolsPath.concat(...appendage) as DevToolsPathType;
  }

  static trim<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType): DevToolsPathType {
    return devToolsPath.trim() as DevToolsPathType;
  }

  static slice<DevToolsPathType extends BrandedPathString>(
      devToolsPath: DevToolsPathType, start?: number, end?: number): DevToolsPathType {
    return devToolsPath.slice(start, end) as DevToolsPathType;
  }

  static join<DevToolsPathType extends BrandedPathString>(devToolsPaths: DevToolsPathType[], separator?: string):
      DevToolsPathType {
    return devToolsPaths.join(separator) as DevToolsPathType;
  }

  static split<DevToolsPathType extends BrandedPathString>(
      devToolsPath: DevToolsPathType, separator: string|RegExp, limit?: number): DevToolsPathType[] {
    return devToolsPath.split(separator, limit) as DevToolsPathType[];
  }

  static toLowerCase<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType): DevToolsPathType {
    return devToolsPath.toLowerCase() as DevToolsPathType;
  }

  static isValidUrlString(str: string): str is Platform.DevToolsPath.UrlString {
    return new ParsedURL(str).isValid;
  }

  static urlWithoutHash(url: string): string {
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      return url.substr(0, hashIndex);
    }
    return url;
  }

  static urlRegex(): RegExp {
    if (ParsedURL.urlRegexInstance) {
      return ParsedURL.urlRegexInstance;
    }
    // RegExp groups:
    // 1 - scheme, hostname, ?port
    // 2 - scheme (using the RFC3986 grammar)
    // 3 - ?user:password
    // 4 - hostname
    // 5 - ?port
    // 6 - ?path
    // 7 - ?query
    // 8 - ?fragment
    const schemeRegex = /([A-Za-z][A-Za-z0-9+.-]*):\/\//;
    const userRegex = /(?:([A-Za-z0-9\-._~%!$&'()*+,;=:]*)@)?/;
    const hostRegex = /((?:\[::\d?\])|(?:[^\s\/:]*))/;
    const portRegex = /(?::([\d]+))?/;
    const pathRegex = /(\/[^#?]*)?/;
    const queryRegex = /(?:\?([^#]*))?/;
    const fragmentRegex = /(?:#(.*))?/;

    ParsedURL.urlRegexInstance = new RegExp(
        '^(' + schemeRegex.source + userRegex.source + hostRegex.source + portRegex.source + ')' + pathRegex.source +
        queryRegex.source + fragmentRegex.source + '$');
    return ParsedURL.urlRegexInstance;
  }

  static extractPath(url: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.EncodedPathString {
    const parsedURL = this.fromString(url);
    return (parsedURL ? parsedURL.path : '') as Platform.DevToolsPath.EncodedPathString;
  }

  static extractOrigin(url: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString {
    const parsedURL = this.fromString(url);
    return parsedURL ? parsedURL.securityOrigin() : '' as Platform.DevToolsPath.UrlString;
  }

  static extractExtension(url: string): string {
    url = ParsedURL.urlWithoutHash(url);
    const indexOfQuestionMark = url.indexOf('?');
    if (indexOfQuestionMark !== -1) {
      url = url.substr(0, indexOfQuestionMark);
    }
    const lastIndexOfSlash = url.lastIndexOf('/');
    if (lastIndexOfSlash !== -1) {
      url = url.substr(lastIndexOfSlash + 1);
    }
    const lastIndexOfDot = url.lastIndexOf('.');
    if (lastIndexOfDot !== -1) {
      url = url.substr(lastIndexOfDot + 1);
      const lastIndexOfPercent = url.indexOf('%');
      if (lastIndexOfPercent !== -1) {
        return url.substr(0, lastIndexOfPercent);
      }
      return url;
    }
    return '';
  }

  static extractName(url: string): string {
    let index = url.lastIndexOf('/');
    const pathAndQuery = index !== -1 ? url.substr(index + 1) : url;
    index = pathAndQuery.indexOf('?');
    return index < 0 ? pathAndQuery : pathAndQuery.substr(0, index);
  }

  static completeURL(baseURL: Platform.DevToolsPath.UrlString, href: string): Platform.DevToolsPath.UrlString|null {
    // Return special URLs as-is.
    if (href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('javascript:') ||
        href.startsWith('mailto:')) {
      return href as Platform.DevToolsPath.UrlString;
    }

    // Return absolute URLs with normalized path and other components as-is.
    const trimmedHref = href.trim();
    const parsedHref = this.fromString(trimmedHref);
    if (parsedHref?.scheme) {
      const securityOrigin = parsedHref.securityOrigin();
      const pathText = normalizePath(parsedHref.path);
      const queryText = parsedHref.queryParams && `?${parsedHref.queryParams}`;
      const fragmentText = parsedHref.fragment && `#${parsedHref.fragment}`;
      return securityOrigin + pathText + queryText + fragmentText as Platform.DevToolsPath.UrlString;
    }

    const parsedURL = this.fromString(baseURL);
    if (!parsedURL) {
      return null;
    }

    if (parsedURL.isDataURL()) {
      return href as Platform.DevToolsPath.UrlString;
    }

    if (href.length > 1 && href.charAt(0) === '/' && href.charAt(1) === '/') {
      // href starts with "//" which is a full URL with the protocol dropped (use the baseURL protocol).
      return parsedURL.scheme + ':' + href as Platform.DevToolsPath.UrlString;
    }

    const securityOrigin = parsedURL.securityOrigin();
    const pathText = parsedURL.path;
    const queryText = parsedURL.queryParams ? '?' + parsedURL.queryParams : '';

    // Empty href resolves to a URL without fragment.
    if (!href.length) {
      return securityOrigin + pathText + queryText as Platform.DevToolsPath.UrlString;
    }

    if (href.charAt(0) === '#') {
      return securityOrigin + pathText + queryText + href as Platform.DevToolsPath.UrlString;
    }

    if (href.charAt(0) === '?') {
      return securityOrigin + pathText + href as Platform.DevToolsPath.UrlString;
    }

    const hrefMatches = href.match(/^[^#?]*/);
    if (!hrefMatches || !href.length) {
      throw new Error('Invalid href');
    }
    let hrefPath: string = hrefMatches[0];
    const hrefSuffix = href.substring(hrefPath.length);
    if (hrefPath.charAt(0) !== '/') {
      hrefPath = parsedURL.folderPathComponents + '/' + hrefPath;
    }
    return securityOrigin + normalizePath(hrefPath) + hrefSuffix as Platform.DevToolsPath.UrlString;
  }

  static splitLineAndColumn(string: string): {
    url: Platform.DevToolsPath.UrlString,
    lineNumber: (number|undefined),
    columnNumber: (number|undefined),
  } {
    // Only look for line and column numbers in the path to avoid matching port numbers.
    const beforePathMatch = string.match(ParsedURL.urlRegex());
    let beforePath = '';
    let pathAndAfter: string = string;
    if (beforePathMatch) {
      beforePath = beforePathMatch[1];
      pathAndAfter = string.substring(beforePathMatch[1].length);
    }

    const lineColumnRegEx = /(?::(\d+))?(?::(\d+))?$/;
    const lineColumnMatch = lineColumnRegEx.exec(pathAndAfter);
    let lineNumber;
    let columnNumber;
    console.assert(Boolean(lineColumnMatch));
    if (!lineColumnMatch) {
      return {url: string as Platform.DevToolsPath.UrlString, lineNumber: 0, columnNumber: 0};
    }

    if (typeof (lineColumnMatch[1]) === 'string') {
      lineNumber = parseInt(lineColumnMatch[1], 10);
      // Immediately convert line and column to 0-based numbers.
      lineNumber = isNaN(lineNumber) ? undefined : lineNumber - 1;
    }
    if (typeof (lineColumnMatch[2]) === 'string') {
      columnNumber = parseInt(lineColumnMatch[2], 10);
      columnNumber = isNaN(columnNumber) ? undefined : columnNumber - 1;
    }

    let url: Platform.DevToolsPath.UrlString =
        beforePath + pathAndAfter.substring(0, pathAndAfter.length - lineColumnMatch[0].length) as
        Platform.DevToolsPath.UrlString;
    if (lineColumnMatch[1] === undefined && lineColumnMatch[2] === undefined) {
      const wasmCodeOffsetRegex = /wasm-function\[\d+\]:0x([a-z0-9]+)$/g;
      const wasmCodeOffsetMatch = wasmCodeOffsetRegex.exec(pathAndAfter);
      if (wasmCodeOffsetMatch && typeof (wasmCodeOffsetMatch[1]) === 'string') {
        url = ParsedURL.removeWasmFunctionInfoFromURL(url);
        columnNumber = parseInt(wasmCodeOffsetMatch[1], 16);
        columnNumber = isNaN(columnNumber) ? undefined : columnNumber;
      }
    }

    return {url, lineNumber, columnNumber};
  }

  static removeWasmFunctionInfoFromURL(url: string): Platform.DevToolsPath.UrlString {
    const wasmFunctionRegEx = /:wasm-function\[\d+\]/;
    const wasmFunctionIndex = url.search(wasmFunctionRegEx);
    if (wasmFunctionIndex === -1) {
      return url as Platform.DevToolsPath.UrlString;
    }
    return ParsedURL.substring(url as Platform.DevToolsPath.UrlString, 0, wasmFunctionIndex);
  }

  private static beginsWithWindowsDriveLetter(url: string): boolean {
    return /^[A-Za-z]:/.test(url);
  }

  private static beginsWithScheme(url: string): boolean {
    return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url);
  }

  static isRelativeURL(url: string): boolean {
    return !this.beginsWithScheme(url) || this.beginsWithWindowsDriveLetter(url);
  }

  isAboutBlank(): boolean {
    return this.url === 'about:blank';
  }

  isDataURL(): boolean {
    return this.scheme === 'data';
  }

  extractDataUrlMimeType(): {type: string|undefined, subtype: string|undefined} {
    const regexp = /^data:((?<type>\w+)\/(?<subtype>\w+))?(;base64)?,/;
    const match = this.url.match(regexp);
    return {
      type: match?.groups?.type,
      subtype: match?.groups?.subtype,
    };
  }

  isBlobURL(): boolean {
    return this.url.startsWith('blob:');
  }

  lastPathComponentWithFragment(): string {
    return this.lastPathComponent + (this.fragment ? '#' + this.fragment : '');
  }

  domain(): string {
    if (this.isDataURL()) {
      return 'data:';
    }
    return this.host + (this.port ? ':' + this.port : '');
  }

  securityOrigin(): Platform.DevToolsPath.UrlString {
    if (this.isDataURL()) {
      return 'data:' as Platform.DevToolsPath.UrlString;
    }
    const scheme = this.isBlobURL() ? this.blobInnerScheme : this.scheme;
    return scheme + '://' + this.domain() as Platform.DevToolsPath.UrlString;
  }

  urlWithoutScheme(): string {
    if (this.scheme && this.url.startsWith(this.scheme + '://')) {
      return this.url.substring(this.scheme.length + 3);
    }
    return this.url;
  }

  static urlRegexInstance: RegExp|null = null;
}
