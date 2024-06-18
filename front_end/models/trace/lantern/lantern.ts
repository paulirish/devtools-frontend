// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const NetworkRequestTypes = {
  XHR: 'XHR',
  Fetch: 'Fetch',
  EventSource: 'EventSource',
  Script: 'Script',
  Stylesheet: 'Stylesheet',
  Image: 'Image',
  Media: 'Media',
  Font: 'Font',
  Document: 'Document',
  TextTrack: 'TextTrack',
  WebSocket: 'WebSocket',
  Other: 'Other',
  Manifest: 'Manifest',
  SignedExchange: 'SignedExchange',
  Ping: 'Ping',
  Preflight: 'Preflight',
  CSPViolationReport: 'CSPViolationReport',
  Prefetch: 'Prefetch',
} as const;

export {BaseNode} from './BaseNode.js';
export type {Node} from './BaseNode.js';
export {CPUNode} from './CpuNode.js';
export {LanternError as Error} from './LanternError.js';
export {Metric} from './Metric.js';
export {NetworkNode} from './NetworkNode.js';
export {PageDependencyGraph} from './PageDependencyGraph.js';
export * as Metrics from './metrics/metrics.js';
export * as Simulation from './simulation/simulation.js';
export * as TBTUtils from './TBTUtils.js';
export type {
  NetworkRequest,
  ParsedURL,
  ResourcePriority,
  ResourceTiming,
  ResourceType,
  Trace,
  TraceEvent,
} from './types/lantern.js';

export {
  NetworkRequestTypes,
};
