// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Trace from '../../models/trace/trace.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';

import {buildGroupStyle, buildTrackHeader} from './AppenderUtils.js';
import {
  type CompatibilityTracksAppender,
  type DrawOverride,
  type HighlightedEntryInfo,
  type TrackAppender,
  type TrackAppenderName,
  VisualLoggingTrackName,
} from './CompatibilityTracksAppender.js';
import * as Components from './components/components.js';

const UIStrings = {
  /**
   *@description Text in Timeline Flame Chart Data Provider of the Performance panel
   */
  layoutShifts: 'Layout shifts',
  /**
   *@description Text in Timeline Flame Chart Data Provider of the Performance panel
   */
  layoutShiftCluster: 'Layout shift cluster',
  /**
   *@description Text in Timeline Flame Chart Data Provider of the Performance panel
   */
  layoutShift: 'Layout shift',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/LayoutShiftsTrackAppender.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

// Bit of a hack: LayoutShifts are instant events, so have no duration. But
// OPP doesn't do well at making tiny events easy to spot and click. So we
// set it to a small duration so that the user is able to see and click
// them more easily. Long term we will explore a better UI solution to
// allow us to do this properly and not hack around it.
// TODO: Delete this once the new Layout Shift UI ships out of the TIMELINE_LAYOUT_SHIFT_DETAILS experiment
export const LAYOUT_SHIFT_SYNTHETIC_DURATION = Trace.Types.Timing.MicroSeconds(5_000);

export class LayoutShiftsTrackAppender implements TrackAppender {
  readonly appenderName: TrackAppenderName = 'LayoutShifts';

  #compatibilityBuilder: CompatibilityTracksAppender;
  #parsedTrace: Readonly<Trace.Handlers.Types.ParsedTrace>;

  constructor(compatibilityBuilder: CompatibilityTracksAppender, parsedTrace: Trace.Handlers.Types.ParsedTrace) {
    this.#compatibilityBuilder = compatibilityBuilder;
    this.#parsedTrace = parsedTrace;
  }

  /**
   * Appends into the flame chart data the data corresponding to the
   * layout shifts track.
   * @param trackStartLevel the horizontal level of the flame chart events where
   * the track's events will start being appended.
   * @param expanded wether the track should be rendered expanded.
   * @returns the first available level to append more data after having
   * appended the track's events.
   */
  appendTrackAtLevel(trackStartLevel: number, expanded?: boolean): number {
    if (this.#parsedTrace.LayoutShifts.clusters.length === 0) {
      return trackStartLevel;
    }
    this.#appendTrackHeaderAtLevel(trackStartLevel, expanded);
    return this.#appendLayoutShiftsAtLevel(trackStartLevel);
  }

  /**
   * Adds into the flame chart data the header corresponding to the
   * layout shifts track. A header is added in the shape of a group in the
   * flame chart data. A group has a predefined style and a reference
   * to the definition of the legacy track (which should be removed
   * in the future).
   * @param currentLevel the flame chart level at which the header is
   * appended.
   */
  #appendTrackHeaderAtLevel(currentLevel: number, expanded?: boolean): void {
    const style = buildGroupStyle({collapsible: false});
    const group = buildTrackHeader(
        VisualLoggingTrackName.LAYOUT_SHIFTS, currentLevel, i18nString(UIStrings.layoutShifts), style,
        /* selectable= */ true, expanded);
    this.#compatibilityBuilder.registerTrackForGroup(group, this);
  }

  /**
   * Adds into the flame chart data all the layout shifts. These are taken from
   * the clusters that are collected in the LayoutShiftsHandler.
   * @param currentLevel the flame chart level from which layout shifts will
   * be appended.
   * @returns the next level after the last occupied by the appended
   * layout shifts (the first available level to append more data).
   */
  #appendLayoutShiftsAtLevel(currentLevel: number): number {
    const allLayoutShifts = this.#parsedTrace.LayoutShifts.clusters.flatMap(cluster => cluster.events);

    if (Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.TIMELINE_INSIGHTS)) {
      const allClusters = this.#parsedTrace.LayoutShifts.clusters;
      this.#compatibilityBuilder.appendEventsAtLevel(allClusters, currentLevel, this);
    }

    this.preloadScreenshots(allLayoutShifts);
    return this.#compatibilityBuilder.appendEventsAtLevel(allLayoutShifts, currentLevel, this);
  }

  /*
    ------------------------------------------------------------------------------------
     The following methods  are invoked by the flame chart renderer to query features about
     events on rendering.
    ------------------------------------------------------------------------------------
  */

  /**
   * Gets the color an event added by this appender should be rendered with.
   */
  colorForEvent(event: Trace.Types.Events.Event): string {
    const renderingColor = ThemeSupport.ThemeSupport.instance().getComputedValue('--app-color-rendering');
    if (Trace.Types.Events.isSyntheticLayoutShiftCluster(event)) {
      const parsedColor = Common.Color.parse(renderingColor);
      if (parsedColor) {
        const colorWithAlpha = parsedColor.setAlpha(0.5).asString(Common.Color.Format.RGBA);
        return colorWithAlpha;
      }
    }
    return renderingColor;
  }

  /**
   * Gets the title an event added by this appender should be rendered with.
   */
  titleForEvent(event: Trace.Types.Events.Event): string {
    if (Trace.Types.Events.isLayoutShift(event)) {
      return i18nString(UIStrings.layoutShift);
    }
    return '';
  }

  /**
   * Returns the info shown when an event added by this appender
   * is hovered in the timeline.
   */
  highlightedEntryInfo(event: Trace.Types.Events.Event): HighlightedEntryInfo {
    const score = Trace.Types.Events.isLayoutShift(event)       ? event.args.data?.weighted_score_delta ?? 0 :
        Trace.Types.Events.isSyntheticLayoutShiftCluster(event) ? event.clusterCumulativeScore :
                                                                  -1;
    const title = Trace.Types.Events.isLayoutShift(event)       ? i18nString(UIStrings.layoutShift) :
        Trace.Types.Events.isSyntheticLayoutShiftCluster(event) ? i18nString(UIStrings.layoutShiftCluster) :
                                                                  event.name;

    let additionalElement;
    if (Trace.Types.Events.isSyntheticLayoutShift(event)) {
      const maxSize = new UI.Geometry.Size(600, 600);
      additionalElement = LayoutShiftsTrackAppender.createShiftViz(event, this.#parsedTrace, maxSize);
    }

    // Score isn't a duration, but the UI works anyhow.
    return {title, formattedTime: score.toFixed(4), additionalElement};
  }

  getDrawOverride(event: Trace.Types.Events.Event): DrawOverride|undefined {
    if (!Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.TIMELINE_INSIGHTS)) {
      // If the new CLS experience isn't on.. Continue to present that Shifts are 5ms long. (but now via drawOverrides)
      // TODO: Remove this when the experiment ships
      if (Trace.Types.Events.isLayoutShift(event)) {
        return (context, x, y, _width, levelHeight, timeToPosition) => {
          const fakeDurMs = Trace.Helpers.Timing.microSecondsToMilliseconds(
              Trace.Types.Timing.MicroSeconds(event.ts + LAYOUT_SHIFT_SYNTHETIC_DURATION));
          const barEnd = timeToPosition(fakeDurMs);
          const barWidth = barEnd - x;
          context.fillStyle = this.colorForEvent(event);
          context.fillRect(x, y, barWidth - 0.5, levelHeight - 1);
          return {
            x,
            width: barWidth,
          };
        };
      }
    }

    if (Trace.Types.Events.isLayoutShift(event)) {
      const score = event.args.data?.weighted_score_delta || 0;

      // `buffer` is how much space is between the actual diamond shape and the
      // edge of its select box. The select box will have a constant size
      // so a larger `buffer` will create a smaller diamond.
      //
      // This logic will scale the size of the diamond based on the layout shift score.
      // A LS score of >=0.1 will create a diamond of maximum size
      // A LS score of ~0 will create a diamond of minimum size (exactly 0 should not happen in practice)
      const bufferScale = 1 - Math.min(score / 0.10, 1);

      return (context, x, y, _width, levelHeight) => {
        // levelHeight is 17px, so this math translates to a minimum diamond size of 5.6px tall.
        const maxBuffer = levelHeight / 3;
        const buffer = bufferScale * maxBuffer;

        const boxSize = levelHeight;
        const halfSize = boxSize / 2;
        context.save();
        context.beginPath();
        context.moveTo(x, y + buffer);
        context.lineTo(x + halfSize - buffer, y + halfSize);
        context.lineTo(x, y + levelHeight - buffer);
        context.lineTo(x - halfSize + buffer, y + halfSize);
        context.closePath();
        context.fillStyle = this.colorForEvent(event);

        context.fill();
        context.restore();
        return {
          x: x - halfSize,
          width: boxSize,
        };
      };
    }
    if (Trace.Types.Events.isSyntheticLayoutShiftCluster(event)) {
      return (context, x, y, width, levelHeight) => {
        const barHeight = levelHeight * 0.2;
        const barY = y + (levelHeight - barHeight) / 2 + 0.5;
        context.fillStyle = this.colorForEvent(event);
        context.fillRect(x, barY, width - 0.5, barHeight - 1);
        return {x, width, z: -1};
      };
    }
    return;
  }

  preloadScreenshots(events: Trace.Types.Events.SyntheticLayoutShift[]) {
    const screenshotsToLoad: Set<Trace.Types.Events.SyntheticScreenshot|undefined> = new Set();
    for (const event of events) {
      screenshotsToLoad.add(event.parsedData.screenshots.before);
      screenshotsToLoad.add(event.parsedData.screenshots.after);
    }
    screenshotsToLoad.forEach(screenshot => {
      if (!screenshot) {
        return;
      }
      // TODO: handle this promise
      UI.UIUtils.loadImage(screenshot.args.dataUri)
          .then(image => {
            image && this.#parsedTrace.Screenshots.screenshotImageCache.set(screenshot, image);
          })
          .catch(console.warn);
    });
  }

  static createShiftViz(
      event: Trace.Types.Events.SyntheticLayoutShift, parsedTrace: Trace.Handlers.Types.ParsedTrace,
      maxSize: UI.Geometry.Size): HTMLElement|undefined {
    //TODO: maybe remove maxSize
    const screenshots = event.parsedData.screenshots;
    const viewport = parsedTrace.Meta.viewportRect;
    const vizContainer = document.createElement('div');
    vizContainer.classList.add('layout-shift-viz');

    const beforeImage = screenshots.before && parsedTrace.Screenshots.screenshotImageCache.get(screenshots.before);
    let afterImage = screenshots.after && parsedTrace.Screenshots.screenshotImageCache.get(screenshots.after);

    if (!beforeImage || !afterImage || !viewport) {
      return;
    }

    /** The Layout Instability API in Blink, which reports the LayoutShift trace events, is not based on CSS pixels but
     * physical pixels. As such the values in the impacted_nodes field need to be normalized to CSS units in order to
     * map them to the viewport dimensions, which we get in CSS pixels. We do that by dividing the values by the devicePixelRatio.
     * See https://crbug.com/1300309
     */
    const dpr = parsedTrace.Meta.devicePixelRatio;
    if (dpr === undefined || !beforeImage) {
      return;
    }

    // Helper to re-scale rectangles, removing DPR effect
    const scaleRect = (rect: Trace.Types.Events.TraceRect): DOMRect => {
      const {width: vw, height: vh} = viewport;
      return new DOMRect(
          rect[0] / dpr,
          rect[1] / dpr,
          rect[2] / dpr,
          rect[3] / dpr,
      );
    };
    const beforeRects = (event.args.data?.impacted_nodes?.map(node => scaleRect(node.old_rect)) ?? []);
    const afterRects = (event.args.data?.impacted_nodes?.map(node => scaleRect(node.new_rect)) ?? []);

    // Calculate scaling factor based on maxSize.
    // If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
    // That's because this function is complete before it's added to the DOM.. so we can't query offsetHeight for its resolved size…
    const maxSizeScaleFactor =
        Math.min(maxSize.width / beforeImage.naturalWidth, maxSize.height / beforeImage.naturalHeight, 1);
    afterImage.style.width = beforeImage.style.width = `${beforeImage.naturalWidth * maxSizeScaleFactor}px`;
    afterImage.style.height = beforeImage.style.height = `${beforeImage.naturalHeight * maxSizeScaleFactor}px`;
    afterImage.classList.add('layout-shift-viz-screenshot--after');
    vizContainer.append(beforeImage, afterImage);

    // Need to onvert css pixel coordinate spaces into the size of the 500px screenshot image
    const cssPixelToScreenshotScaleFactor =
        Math.min(beforeImage.naturalWidth / viewport.width, beforeImage.naturalHeight / viewport.height, 1)

    const setRectPosition = (rectEl: HTMLDivElement, rect: DOMRect) => {
      rectEl.style.left = `${rect.x * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
      rectEl.style.top = `${rect.y * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
      rectEl.style.width = `${rect.width * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
      rectEl.style.height = `${rect.height * maxSizeScaleFactor * cssPixelToScreenshotScaleFactor}px`;
    };

    // Create and position individual rects representing each impacted_node within a shift
    const rectEls = beforeRects.map((beforeRect, i) => {
      const rectEl = document.createElement('div');
      rectEl.classList.add('layout-shift-viz-rect');

      let currentRect = beforeRect;
      // If it's a 0x0x0x0 rect, then set to new, so we can fade it in from the new position instead.
      if ([beforeRect.width, beforeRect.height, beforeRect.x, beforeRect.y].every(v => v === 0)) {
        currentRect = afterRects[i];
        rectEl.style.opacity = '0';
      } else {
        rectEl.style.opacity = '0.4';
      }

      setRectPosition(rectEl, currentRect);
      vizContainer.appendChild(rectEl);
      return rectEl;
    });

    setTimeout(() => {
      // Fade in the 'after' screenshot
      afterImage.style.opacity = '1';

      // Animate to the after rectangle position.
      rectEls.forEach((rectEl, i) => {
        setRectPosition(rectEl, afterRects[i]);
        rectEl.style.opacity = '0.7';
      });
    }, 1000);


    return vizContainer;
  }
}
