// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TraceEngine from '../../models/trace/trace.js';
import type * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';

import {
  type CompatibilityTracksAppender,
  type TrackAppender,
  type HighlightedEntryInfo,
  type TrackAppenderName,
} from './CompatibilityTracksAppender.js';
import * as i18n from '../../core/i18n/i18n.js';

import {type TimelineMarkerStyle} from './TimelineUIUtils.js';
import type * as Common from '../../core/common/common.js';
import {buildGroupStyle, buildTrackHeader, getFormattedTime} from './AppenderUtils.js';

const UIStrings = {
  /**
   *@description Text in Timeline Flame Chart Data Provider of the Performance panel
   */
  trackTitle: 'UberFrames',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/UberFramesTrackAppender.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

const eventLatencyBreakdownTypeNames = TraceEngine.Handlers.ModelHandlers.UberFramesHandler.eventLatencyBreakdownTypeNames;

/**
 * Show the frame timeline in an easy to understand manner.
 * left whisker (input or (pre BMF stuff?)): EventLatency start. Not sure about loaf.
 * Box body (main thread time):         SendBeginMainFrameToCommit      (RendererMainProcessing + RendererMainFinishedToCommit are not always there)
 * Right leg (actionable raster time):  EndCommitToActivation
 * Right whisker (to presentation):     Activation + EndActivateToSubmitCompositorFrame  SubmitCompositorFrameToPresentationCompositorFrame
 */
export class UberFramesTrackAppender implements TrackAppender {
  readonly appenderName: TrackAppenderName = 'UberFrames';

  #colorGenerator: Common.Color.Generator;
  #compatibilityBuilder: CompatibilityTracksAppender;
  #flameChartData: PerfUI.FlameChart.FlameChartTimelineData;
  #traceParsedData: Readonly<TraceEngine.Handlers.Migration.PartialTraceData>;

  constructor(
      compatibilityBuilder: CompatibilityTracksAppender, flameChartData: PerfUI.FlameChart.FlameChartTimelineData,
      traceParsedData: TraceEngine.Handlers.Migration.PartialTraceData, colorGenerator: Common.Color.Generator) {
    this.#compatibilityBuilder = compatibilityBuilder;
    this.#colorGenerator = colorGenerator;
    this.#flameChartData = flameChartData;
    this.#traceParsedData = traceParsedData;
  }

  /**
   * Appends into the flame chart data the data corresponding to the
   * timings track.
   * @param trackStartLevel the horizontal level of the flame chart events where
   * the track's events will start being appended.
   * @param expanded wether the track should be rendered expanded.
   * @returns the first available level to append more data after having
   * appended the track's events.
   */
  appendTrackAtLevel(trackStartLevel: number, expanded?: boolean): number {
    const uberNonWaterfallEvts = this.#traceParsedData.UberFrames.nonWaterfallEvts;

    if (uberNonWaterfallEvts.length === 0) {
      return trackStartLevel;
    }
    this.#appendTrackHeaderAtLevel(trackStartLevel, expanded);

    let newLevel;
    // Do all events now, (which also includes waterfall again)
    newLevel = this.#compatibilityBuilder.appendEventsAtLevel(uberNonWaterfallEvts, trackStartLevel, this);
    // newLevel = this.#compatibilityBuilder.appendEventsAtLevel(uberFrameAsyncEvts, trackStartLevel, this);
    return newLevel; // this.#compatibilityBuilder.appendEventsAtLevel(consoleTimings, newLevel, this);
  }

  /**
   * Adds into the flame chart data the header corresponding to the
   * timings track. A header is added in the shape of a group in the
   * flame chart data. A group has a predefined style and a reference
   * to the definition of the legacy track (which should be removed
   * in the future).
   * @param currentLevel the flame chart level at which the header is
   * appended.
   */
  #appendTrackHeaderAtLevel(currentLevel: number, expanded?: boolean): void {

    const style =
        buildGroupStyle({shareHeaderLine: true, useFirstLineForOverview: true, collapsible: true});
    const group =
        buildTrackHeader(currentLevel, i18nString(UIStrings.trackTitle), style, /* selectable= */ true, expanded);
    this.#compatibilityBuilder.registerTrackForGroup(group, this);
  }

  /*
    ------------------------------------------------------------------------------------
     The following methods  are invoked by the flame chart renderer to query features about
     events on rendering.
    ------------------------------------------------------------------------------------
  */

  /**
   * Gets the style for a page load marker event.
   */
  markerStyleForEvent(markerEvent: TraceEngine.Types.TraceEvents.PageLoadEvent): TimelineMarkerStyle {
    const tallMarkerDashStyle = [6, 4];
    const color = 'grey';

    return {
      title: markerEvent.name,
      dashStyle: tallMarkerDashStyle,
      lineWidth: 0.5,
      color: color,
      tall: true,
      lowPriority: false,
    };
  }

  /**
   * Gets the color an event added by this appender should be rendered with.
   */
  colorForEvent(event: TraceEngine.Types.TraceEvents.TraceEventData): string {
    if (TraceEngine.Handlers.ModelHandlers.PageLoadMetrics.eventIsPageLoadEvent(event)) {
      return this.markerStyleForEvent(event).color;
    }
    // Performance and console timings.
    return this.#colorGenerator.colorForID(event.name);
  }

  /**
   * Gets the title an event added by this appender should be rendered with.
   */
  titleForEvent(event: TraceEngine.Types.TraceEvents.TraceEventData): string {
    const frameSeqId =
      event.args.frameSeqId ??
      event.args.frame_sequence ??
      event.args.begin_frame_id ??
      event.args.args?.sequence_number ??
      event.args?.data?.beginEvent?.args?.sequence_number ??  // my additions to chrome_frame_reporter
      event.args?.data?.beginEvent?.args?.data?.sequence_number ??
      event.args?.data?.beginEvent?.args?.chrome_frame_reporter?.frame_sequence ??
      event.args?.data?.beginEvent?.args?.send_begin_mainframe_to_commit_breakdown?.frame_sequence ??
      '';

    if (frameSeqId) {return `${event.name} ${frameSeqId % 1000}`;}

    const localID = event.args?.data?.beginEvent?.id2?.local;
    if (localID) {return `${event.name} ${localID}`;}

    return event.name;
  }

  /**
   * Returns the info shown when an event added by this appender
   * is hovered in the timeline.
   */
  highlightedEntryInfo(event: TraceEngine.Types.TraceEvents.TraceEventData): HighlightedEntryInfo {
    const title = this.titleForEvent(event);

    return {title, formattedTime: getFormattedTime(event.dur)};
  }
}