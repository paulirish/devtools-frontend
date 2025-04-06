// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Trace from '../../../models/trace/trace.js';

import {AICallTree} from './AICallTree.js';

/**
 * This class holds the Insight that is active when the user has entered the
 * Ask AI flow from the Insights sidebar.
 * Ideally we would just use the InsightModel instance itself, but we need to
 * also store a reference to the parsed trace as we use that to populate the
 * data provided to the LLM, so we use this class as a container for the insight
 * and the parsed trace.
 */
export class ActiveInsight {
  insight: Trace.Insights.Types.InsightModel;
  parsedTrace: Trace.Handlers.Types.ParsedTrace;
  bounds: Trace.Types.Timing.TraceWindowMicro|null;

  constructor(
      insight: Trace.Insights.Types.InsightModel, parsedTrace: Trace.Handlers.Types.ParsedTrace,
      bounds: Trace.Types.Timing.TraceWindowMicro|null) {
    this.insight = insight;
    this.parsedTrace = parsedTrace;
    this.bounds = bounds;
  }

  title(): string {
    return this.insight.title;
  }
}

export class AIQueries {
  /**
   * Returns the set of network requests that occurred within the timeframe of this Insight.
   */
  static networkRequests(activeInsight: ActiveInsight): readonly Trace.Types.Events.SyntheticNetworkRequest[] {
    const bounds = activeInsight.bounds ?? fallbackInsightBounds(activeInsight);

    // Now we find network requests that:
    // 1. began within the bounds
    // 2. completed within the bounds
    const matchedRequests: Trace.Types.Events.SyntheticNetworkRequest[] = [];
    for (const request of activeInsight.parsedTrace.NetworkRequests.byTime) {
      // Requests are ordered by time ASC, so if we find one request that is
      // beyond the max, the rest are guaranteed to be also and we can break early.
      if (request.ts > bounds.max) {
        break;
      }
      if (request.args.data.url.startsWith('data:')) {
        // For the sake of the LLM querying data, we don't care about data: URLs.
        continue;
      }
      if (request.ts >= bounds.min && request.ts + request.dur <= bounds.max) {
        matchedRequests.push(request);
      }
    }

    return matchedRequests;
  }

  /**
   * Returns the single network request. We do not check to filter this by the
   * bounds of the insight, because the only way that the LLM has found this
   * request is by first inspecting a summary of relevant network requests for
   * the given insight. So if it then looks up a request by URL, we know that
   * is a valid and relevant request.
   */
  static networkRequest(parsedTrace: Trace.Handlers.Types.ParsedTrace, url: string):
      Trace.Types.Events.SyntheticNetworkRequest|null {
    return parsedTrace.NetworkRequests.byTime.find(r => r.args.data.url === url) ?? null;
  }

  /**
   * Returns an AI Call Tree representing the activity on the main thread for
   * the relevant time range of the given insight.
   */
  static mainThreadActivity(activeInsight: ActiveInsight): AICallTree|null {
    const {insight, parsedTrace, bounds} = activeInsight;

    /**
     * We cannot assume that there is one main thread as there are scenarios
     * where there can be multiple (see crbug.com/402658800) as an example.
     * Therefore we calculate the main thread by using the thread that the
     * Insight has been associated to. Most Insights relate to a navigation, so
     * in this case we can use the navigation's PID/TID as we know that will
     * have run on the main thread that we are interested in.
     * If we do not have a navigation, we fall back to looking for the first
     * thread we find that is of type MAIN_THREAD.
     * Longer term we should solve this at the Trace Engine level to avoid
     * look-ups like this; this is the work that is tracked in
     * crbug.com/402658800.
     */
    let mainThreadPID: Trace.Types.Events.ProcessID|null = null;
    let mainThreadTID: Trace.Types.Events.ThreadID|null = null;

    if (insight.navigationId) {
      const navigation = parsedTrace.Meta.navigationsByNavigationId.get(insight.navigationId);
      if (navigation?.args.data?.isOutermostMainFrame) {
        mainThreadPID = navigation.pid;
        mainThreadTID = navigation.tid;
      }
    }

    const threads = Trace.Handlers.Threads.threadsInTrace(parsedTrace);
    const thread = threads.find(thread => {
      if (mainThreadPID && mainThreadTID) {
        return thread.pid === mainThreadPID && thread.tid === mainThreadTID;
      }
      return thread.type === Trace.Handlers.Threads.ThreadType.MAIN_THREAD;
    });
    if (!thread) {
      return null;
    }

    return AICallTree.fromTimeOnThread({
      thread: {
        pid: thread.pid,
        tid: thread.tid,
      },
      parsedTrace,
      bounds: bounds ?? fallbackInsightBounds(activeInsight),
    });
  }
}

/**
 * If the insight doesn't have overlays, we determine rough bounds for it.
 *
 * If the insight is attached to a navigation, this will be the start of that
 * navigation through to either the next navigation, or the end of the trace.
 * For some insights we change the bounds; for LCP insights we treat the max
 * bound as LCP time, as anything that happens after that cannot have impacted
 * it.
 */
function fallbackInsightBounds(activeInsight: ActiveInsight): Trace.Types.Timing.TraceWindowMicro {
  const {insight, parsedTrace} = activeInsight;
  const navigationStart =
      insight.navigationId ? parsedTrace.Meta.navigationsByNavigationId.get(insight.navigationId) : undefined;
  const minBound = navigationStart?.ts ?? parsedTrace.Meta.traceBounds.min;

  let maxBound = customMaxBoundForInsight(insight);
  if (!maxBound) {
    maxBound = parsedTrace.Meta.traceBounds.max;
    if (navigationStart) {
      const nextNavigation = getNextNavigation(navigationStart, parsedTrace);
      if (nextNavigation) {
        maxBound = nextNavigation.ts;
      }
    }
  }
  return Trace.Helpers.Timing.traceWindowFromMicroSeconds(minBound, maxBound);
}

/**
 * For a given navigation on the main frame, return the next navigation, if there was one.
 */
function getNextNavigation(
    navigation: Trace.Types.Events.NavigationStart,
    parsedTrace: Trace.Handlers.Types.ParsedTrace): Trace.Types.Events.NavigationStart|null {
  for (let i = 0; i < parsedTrace.Meta.mainFrameNavigations.length; i++) {
    const currentNavigationStart = parsedTrace.Meta.mainFrameNavigations[i];
    if (currentNavigationStart.args.data?.navigationId === navigation.args.data?.navigationId) {
      return parsedTrace.Meta.mainFrameNavigations.at(i + 1) ?? null;
    }
  }
  return null;
}

function customMaxBoundForInsight(insight: Trace.Insights.Types.InsightModel): Trace.Types.Timing.Micro|null {
  if (Trace.Insights.Models.LCPPhases.isLCPPhases(insight) && insight.lcpEvent) {
    return insight.lcpEvent.ts;
  }
  return null;
}
