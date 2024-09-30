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

import {buildGroupStyle, buildTrackHeader, getFormattedTime} from './AppenderUtils.js';
import {
  type CompatibilityTracksAppender,
  type DrawOverride,
  type HighlightedEntryInfo,
  type TrackAppender,
  type TrackAppenderName,
  VisualLoggingTrackName,
} from './CompatibilityTracksAppender.js';

const UIStrings = {
  /**
   *@description Text in Timeline Flame Chart Data Provider of the Performance panel
   */
  layoutShifts: 'Layout shifts',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/LayoutShiftsTrackAppender.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

// Bit of a hack: LayoutShifts are instant events, so have no duration. But
// OPP doesn't do well at making tiny events easy to spot and click. So we
// set it to a small duration so that the user is able to see and click
// them more easily. Long term we will explore a better UI solution to
// allow us to do this properly and not hack around it.
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
    const setFlameChartEntryTotalTime =
        (_event: Trace.Types.Events.SyntheticLayoutShift|Trace.Types.Events.SyntheticLayoutShiftCluster,
         index: number): void => {
          let totalTime = LAYOUT_SHIFT_SYNTHETIC_DURATION;
          if (Trace.Types.Events.isSyntheticLayoutShiftCluster(_event)) {
            // This is to handle the cases where there is a singular shift for a cluster.
            // A single shift would make the cluster duration 0 and hard to read.
            // So in this case, give it the LAYOUT_SHIFT_SYNTHETIC_DURATION duration.
            totalTime = _event.dur || LAYOUT_SHIFT_SYNTHETIC_DURATION;
          }
          this.#compatibilityBuilder.getFlameChartTimelineData().entryTotalTimes[index] =
              Trace.Helpers.Timing.microSecondsToMilliseconds(totalTime);
        };
    let shiftLevel = currentLevel;
    if (Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.TIMELINE_LAYOUT_SHIFT_DETAILS)) {
      const allClusters = this.#parsedTrace.LayoutShifts.clusters;
      this.#compatibilityBuilder.appendEventsAtLevel(allClusters, currentLevel + 1, this, setFlameChartEntryTotalTime);

      // layout shifts should be below clusters.
      shiftLevel = currentLevel + 2;

      return this.#compatibilityBuilder.appendEventsAtLevel(allLayoutShifts, shiftLevel, this);
    }

    return this.#compatibilityBuilder.appendEventsAtLevel(
        allLayoutShifts, shiftLevel, this, setFlameChartEntryTotalTime);
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
  colorForEvent(_event: Trace.Types.Events.Event): string {
    return ThemeSupport.ThemeSupport.instance().getComputedValue('--app-color-rendering');
  }

  /**
   * Gets the title an event added by this appender should be rendered with.
   */
  titleForEvent(event: Trace.Types.Events.Event): string {
    if (Trace.Types.Events.isLayoutShift(event)) {
      return 'Layout shift';
    }
    if (Trace.Types.Events.isSyntheticLayoutShiftCluster(event)) {
      return 'Layout shift cluster';
    }
    return event.name;
  }

  /**
   * Returns the info shown when an event added by this appender
   * is hovered in the timeline.
   */
  highlightedEntryInfo(event: Trace.Types.Events.LayoutShift): HighlightedEntryInfo {
    const title = this.titleForEvent(event);
    return {title, formattedTime: getFormattedTime(event.dur)};
  }

  getDrawOverride(event: Trace.Types.Events.Event): DrawOverride|undefined {
    if (!Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.TIMELINE_LAYOUT_SHIFT_DETAILS)) {
      return;
    }

    if (!Trace.Types.Events.isLayoutShift(event)) {
      return;
    }

    const score = event.args.data?.weighted_score_delta || 0;

    // `buffer` is how much space is between the actual diamond shape and the
    // edge of its select box. The select box will have a constant size
    // so a larger `buffer` will create a smaller diamond.
    //
    // This logic will scale the size of the diamond based on the layout shift score.
    // A LS score of >=0.1 will create a diamond of maximum size
    // A LS score of ~0 will create a diamond of minimum size (exactly 0 should not happen in practice)
    const bufferScale = 1 - Math.min(score / 0.1, 1);
    const buffer = Math.round(bufferScale * 3);

    return (context, x, y, _width, height) => {
      const boxSize = height;
      const halfSize = boxSize / 2;
      context.beginPath();
      context.moveTo(x, y + buffer);
      context.lineTo(x + halfSize - buffer, y + halfSize);
      context.lineTo(x, y + height - buffer);
      context.lineTo(x - halfSize + buffer, y + halfSize);
      context.closePath();
      context.fillStyle = this.colorForEvent(event);
      context.fill();
      return {
        x: x - halfSize,
        width: boxSize,
      };
    };
  }
}

export async function drawLayoutShiftScreenshotRects(
    event: Trace.Types.Events.SyntheticLayoutShift,
    parsedTrace: Readonly<Trace.Handlers.Types.EnabledHandlerDataWithMeta<typeof Trace.Handlers.ModelHandlers>>,
    maxSize: UI.Geometry.Size,
    relatedNodesMap: Map<Protocol.DOM.BackendNodeId, SDK.DOMModel.DOMNode|null>|null): Promise<HTMLElement|undefined> {
  const screenshots = event.parsedData.screenshots;
  const viewport = parsedTrace.Meta.viewportRect;
  // TODO paralleize
  const afterImage = screenshots.after?.args.dataUri && await UI.UIUtils.loadImage(screenshots.after?.args.dataUri);
  const beforeImage = screenshots.before?.args.dataUri && await UI.UIUtils.loadImage(screenshots.before?.args.dataUri);
  if (!beforeImage || !viewport) {
    return;
  }

  /** The Layout Instability API in Blink, which reports the LayoutShift trace events, is not based on CSS pixels but
   * physical pixels. As such the values in the impacted_nodes field need to be normalized to CSS units in order to
   * map them to the viewport dimensions, which we get in CSS pixels. We do that by dividing the values by the devicePixelRatio.
   * See https://crbug.com/1300309
   */
  const dpr = parsedTrace.Meta.devicePixelRatio;
  if (dpr === undefined) {
    return;
  }

  const beforeRects =
      event.args.data?.impacted_nodes?.map(
          node => new DOMRect(
              node.old_rect[0] / dpr, node.old_rect[1] / dpr, node.old_rect[2] / dpr, node.old_rect[3] / dpr)) ??
      [];
  const afterRects =
      event.args.data?.impacted_nodes?.map(
          node => new DOMRect(
              node.new_rect[0] / dpr, node.new_rect[1] / dpr, node.new_rect[2] / dpr, node.new_rect[3] / dpr)) ??
      [];

  const screenshotContainer = document.createElement('div');
  screenshotContainer.classList.add('layout-shift-screenshot-preview');
  screenshotContainer.style.position = 'relative';
  screenshotContainer.appendChild(beforeImage);

  // If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
  // That's because this function is complete before it's added to the DOM.. so we can't query offsetHeight for its resolved size…
  const maxWidth = maxSize.width;
  const maxHeight = maxSize.height;
  const scaleFactor = Math.min(maxWidth / beforeImage.naturalWidth, maxHeight / beforeImage.naturalHeight, 1);
  beforeImage.style.width = `${beforeImage.naturalWidth * scaleFactor}px`;
  beforeImage.style.height = `${beforeImage.naturalHeight * scaleFactor}px`;

  // Setup old rects
  const rectEls = beforeRects.map((beforeRect, i) => {
    const rectEl = document.createElement('div');
    rectEl.classList.add('layout-shift-screenshot-preview-rect');

    // If it's a 0x0x0x0 rect, then set to new, so we can fade it in from the new position instead.
    if ([beforeRect.width, beforeRect.height, beforeRect.x, beforeRect.y].every(v => v === 0)) {
      beforeRect = afterRects[i];
      rectEl.style.opacity = '0';
    } else {
      rectEl.style.opacity = '1';
    }

    const scaledRectX = beforeRect.x * beforeImage.naturalWidth / viewport.width * scaleFactor;
    const scaledRectY = beforeRect.y * beforeImage.naturalHeight / viewport.height * scaleFactor;
    const scaledRectWidth = beforeRect.width * beforeImage.naturalWidth / viewport.width * scaleFactor;
    const scaledRectHeight = beforeRect.height * beforeImage.naturalHeight / viewport.height * scaleFactor;
    rectEl.style.left = `${scaledRectX}px`;
    rectEl.style.top = `${scaledRectY}px`;
    rectEl.style.width = `${scaledRectWidth}px`;
    rectEl.style.height = `${scaledRectHeight}px`;
    rectEl.style.opacity = '0.4';

    screenshotContainer.appendChild(rectEl);
    return rectEl;
  });
  if (afterImage) {
    afterImage.classList.add('layout-shift-screenshot-after');
    screenshotContainer.appendChild(afterImage);
    afterImage.style.width = beforeImage.style.width;
    afterImage.style.height = beforeImage.style.height;
    afterImage.addEventListener('click', () => {
      new Dialog(event, parsedTrace, relatedNodesMap);
    });
  }

  // Update for the after rect positions after a bit.
  setTimeout(() => {
    rectEls.forEach((rectEl, i) => {
      const afterRect = afterRects[i];
      const scaledRectX = afterRect.x * beforeImage.naturalWidth / viewport.width * scaleFactor;
      const scaledRectY = afterRect.y * beforeImage.naturalHeight / viewport.height * scaleFactor;
      const scaledRectWidth = afterRect.width * beforeImage.naturalWidth / viewport.width * scaleFactor;
      const scaledRectHeight = afterRect.height * beforeImage.naturalHeight / viewport.height * scaleFactor;
      rectEl.style.left = `${scaledRectX}px`;
      rectEl.style.top = `${scaledRectY}px`;
      rectEl.style.width = `${scaledRectWidth}px`;
      rectEl.style.height = `${scaledRectHeight}px`;
      rectEl.style.opacity = '0.4';
    });
    if (afterImage) {
      afterImage.style.opacity = '1';
    }
  }, 1000);
  return screenshotContainer;
}

const styles = `
.layout-shift-screenshot-preview {
  position: relative;
}

.layout-shift-screenshot-preview-rect {
  outline: 1px solid color-mix(in srgb, black 20%, var(--app-color-rendering)); /* was rgb(132, 48, 206) */
  background-color: color-mix(in srgb, transparent 50%, var(--app-color-rendering-children)); /* was rgba(132, 48, 206, 0.5) */
  position: absolute;
  transition: all 1s;
  z-index: 200;
}

.layout-shift-screenshot-after {
  opacity: 0;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  transition: opacity 1s;
}

.highlight {
background-color: yellow;
}

`;

// TODO make the below be for layotushifts
export class Dialog {
  private fragment: UI.Fragment.Fragment;
  private readonly widget: UI.XWidget.XWidget;
  private dialog: UI.Dialog.Dialog|null = null;

  constructor(
      event: Trace.Types.Events.SyntheticLayoutShift,
      parsedTrace: Readonly<Trace.Handlers.Types.EnabledHandlerDataWithMeta<typeof Trace.Handlers.ModelHandlers>>,
      relatedNodesMap: Map<Protocol.DOM.BackendNodeId, SDK.DOMModel.DOMNode|null>|null) {
    // const prevButton = UI.UIUtils.createTextButton('\u25C0', this.onPrevFrame.bind(this));
    // UI.Tooltip.Tooltip.install(prevButton, i18nString(UIStrings.previousFrame));
    // const nextButton = UI.UIUtils.createTextButton('\u25B6', this.onNextFrame.bind(this));
    // UI.Tooltip.Tooltip.install(nextButton, i18nString(UIStrings.nextFrame));

    this.fragment = UI.Fragment.Fragment.build`
      <x-widget flex=none margin=12px>
        <x-hbox>
          <x-hbox $='container' overflow=auto border='1px solid #ddd'>
          </x-hbox>
          <x-hbox>
            <ul $='nodes'>

            </ul>
          </x-hbox>
        </x-hbox>
      </x-widget>
    `;
    // <x-hbox x-center justify-content=center margin-top=10px>
    //       ${prevButton}
    //       <x-hbox $='time' margin=8px></x-hbox>
    //       ${nextButton}
    //     </x-hbox>
    this.widget = (this.fragment.element() as UI.XWidget.XWidget);
    (this.widget as HTMLElement).tabIndex = 0;
    // this.widget.addEventListener('keydown', this.keyDown.bind(this), false);
    this.dialog = null;

    void this.render(event, parsedTrace, relatedNodesMap);
  }

  private async render(
      event: Trace.Types.Events.SyntheticLayoutShift,
      parsedTrace: Readonly<Trace.Handlers.Types.EnabledHandlerDataWithMeta<typeof Trace.Handlers.ModelHandlers>>,
      relatedNodesMap: Map<Protocol.DOM.BackendNodeId, SDK.DOMModel.DOMNode|null>|null): Promise<void> {
    const maxSize = new UI.Geometry.Size(800, 800);
    const preview = await drawLayoutShiftScreenshotRects(event, parsedTrace, maxSize, relatedNodesMap);
    if (!preview) {
      return;
    }
    this.fragment.$('container').appendChild(preview);

    const nodes = relatedNodesMap ? Array.from(relatedNodesMap.values()) : [];
    await Promise.all(nodes.map(async (node, i) => {
      const nodeSpan = await Common.Linkifier.Linkifier.linkify(node);

      const rectEl = preview.querySelectorAll('.layout-shift-screenshot-preview-rect').item(i);

      nodeSpan.addEventListener('mouseover', () => rectEl.classList.add('highlight'));
      nodeSpan.addEventListener('mouseleave', () => rectEl.classList.remove('highlight'));

      const li = document.createElement('li');
      li.appendChild(nodeSpan);
      this.fragment.$('nodes').appendChild(li);
    }));


    this.resize();
  }

  hide(): void {
    if (this.dialog) {
      this.dialog.hide();
    }
  }

  private resize(): void {
    if (!this.dialog) {
      this.dialog = new UI.Dialog.Dialog();
      this.dialog.contentElement.appendChild(this.widget);
      this.dialog.setDefaultFocusedElement(this.widget);
      this.dialog.registerRequiredCSS({cssContent: styles});
      this.dialog.show();
    }

    this.dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
  }

  // private keyDown(event: Event): void {
  //   const keyboardEvent = (event as KeyboardEvent);
  //   switch (keyboardEvent.key) {
  //     case 'ArrowLeft':
  //       if (Host.Platform.isMac() && keyboardEvent.metaKey) {
  //         this.onFirstFrame();
  //       } else {
  //         this.onPrevFrame();
  //       }
  //       break;

  //     case 'ArrowRight':
  //       if (Host.Platform.isMac() && keyboardEvent.metaKey) {
  //         this.onLastFrame();
  //       } else {
  //         this.onNextFrame();
  //       }
  //       break;

  //     case 'Home':
  //       this.onFirstFrame();
  //       break;

  //     case 'End':
  //       this.onLastFrame();
  //       break;
  //   }
  // }

  // private onPrevFrame(): void {
  //   if (this.index > 0) {
  //     --this.index;
  //   }
  //   void this.render();
  // }

  // private onNextFrame(): void {
  //   if (this.index < this.#framesCount() - 1) {
  //     ++this.index;
  //   }
  //   void this.render();
  // }

  // private onFirstFrame(): void {
  //   this.index = 0;
  //   void this.render();
  // }

  // private onLastFrame(): void {
  //   this.index = this.#framesCount() - 1;
  //   void this.render();
  // }
}
