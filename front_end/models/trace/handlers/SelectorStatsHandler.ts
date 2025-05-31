// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Micro} from '../types/Timing.js';
import * as Types from '../types/types.js';

let lastUpdateLayoutTreeEvent: Types.Events.UpdateLayoutTree|null = null;
let lastInvalidationNode: Types.Events.InvalidationNode|null = null;

const selectorDataForUpdateLayoutTree = new Map<Types.Events.UpdateLayoutTree, {
  timings: Types.Events.SelectorTiming[],
}>();

const dataForInvalidationEvent = new Array<Types.Events.InvalidationNode>();

export function reset(): void {
  lastUpdateLayoutTreeEvent = null;
  selectorDataForUpdateLayoutTree.clear();
  dataForInvalidationEvent.length = 0;
}

export function handleEvent(event: Types.Events.Event): void {
  if (Types.Events.isStyleRecalcInvalidationTracking(event)) {
    // subtree invalidation
    if (event.args.data.subtree &&
        event.args.data.reason === Types.Events.StyleRecalcInvalidationReason.RELATED_STYLE_RULE &&
        lastInvalidationNode && event.args.data.nodeId === lastInvalidationNode.backendNodeId) {
      lastInvalidationNode.subtree = true;
      return;
    }
  }

  if (Types.Events.isSelectorStats(event) && lastUpdateLayoutTreeEvent && event.args.selector_stats) {
    selectorDataForUpdateLayoutTree.set(lastUpdateLayoutTreeEvent, {
      timings: event.args.selector_stats.selector_timings,
    });
    return;
  }

  if (Types.Events.isStyleInvalidatorInvalidationTracking(event)) {
    const selectorList = new Array<{selector: string, styleSheetId: string}>();
    event.args.data.selectors?.map(selector => {
      selectorList.push({
        selector: selector.selector,
        styleSheetId: selector.style_sheet_id,
      });
    });

    if (selectorList.length > 0) {
      lastInvalidationNode = {
        frame: event.args.data.frame,
        backendNodeId: event.args.data.nodeId,
        node: null,
        type: Types.Events.InvalidationEventType.StyleInvalidatorInvalidationTracking,
        selectorList,
        ts: event.ts,
        tts: event.tts,
        subtree: false,
        lastUpdateLayoutTreeEventTs: lastUpdateLayoutTreeEvent ? lastUpdateLayoutTreeEvent.ts : Micro(0),
      };
      dataForInvalidationEvent.push(lastInvalidationNode);
    }
  }

  if (Types.Events.isUpdateLayoutTree(event)) {
    lastUpdateLayoutTreeEvent = event;
    return;
  }
}

export async function finalize(): Promise<void> {
}

export interface SelectorStatsData {
  dataForUpdateLayoutEvent: Map<Types.Events.UpdateLayoutTree, {
    timings: Types.Events.SelectorTiming[],
  }>;
  dataForInvalidationEvent: Types.Events.InvalidationNode[];
}

export function data(): SelectorStatsData {
  return {
    dataForUpdateLayoutEvent: selectorDataForUpdateLayoutTree,
    dataForInvalidationEvent,
  };
}
