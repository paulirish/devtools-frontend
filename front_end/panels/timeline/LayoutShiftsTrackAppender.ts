// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as TraceEngine from '../../models/trace/trace.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';

import {buildGroupStyle, buildTrackHeader, getFormattedTime} from './AppenderUtils.js';
import {
  type CompatibilityTracksAppender,
  type HighlightedEntryInfo,
  type TrackAppender,
  type TrackAppenderName,
  VisualLoggingTrackName,
} from './CompatibilityTracksAppender.js';
import type * as Timeline from './timeline.js';

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
export const LAYOUT_SHIFT_SYNTHETIC_DURATION = TraceEngine.Types.Timing.MicroSeconds(5_000);

export class LayoutShiftsTrackAppender implements TrackAppender {
  readonly appenderName: TrackAppenderName = 'LayoutShifts';

  #compatibilityBuilder: CompatibilityTracksAppender;
  #traceParsedData: Readonly<TraceEngine.Handlers.Types.TraceParseData>;

  constructor(
      compatibilityBuilder: CompatibilityTracksAppender, traceParsedData: TraceEngine.Handlers.Types.TraceParseData) {
    this.#compatibilityBuilder = compatibilityBuilder;
    this.#traceParsedData = traceParsedData;
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
    if (this.#traceParsedData.LayoutShifts.clusters.length === 0) {
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
    const allLayoutShifts = this.#traceParsedData.LayoutShifts.clusters.flatMap(cluster => cluster.events);
    const setFlameChartEntryTotalTime =
        (_event: TraceEngine.Types.TraceEvents.SyntheticLayoutShift, index: number): void => {
          this.#compatibilityBuilder.getFlameChartTimelineData().entryTotalTimes[index] =
              TraceEngine.Helpers.Timing.microSecondsToMilliseconds(LAYOUT_SHIFT_SYNTHETIC_DURATION);
        };

    return this.#compatibilityBuilder.appendEventsAtLevel(
        allLayoutShifts, currentLevel, this, setFlameChartEntryTotalTime);
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
  colorForEvent(_event: TraceEngine.Types.TraceEvents.TraceEventData): string {
    return ThemeSupport.ThemeSupport.instance().getComputedValue('--app-color-rendering');
  }

  /**
   * Gets the title an event added by this appender should be rendered with.
   */
  titleForEvent(event: TraceEngine.Types.TraceEvents.TraceEventData): string {
    if (TraceEngine.Types.TraceEvents.isTraceEventLayoutShift(event)) {
      return 'Layout shift';
    }
    return event.name;
  }

  /**
   * Returns the info shown when an event added by this appender
   * is hovered in the timeline.
   */
  highlightedEntryInfo(event: TraceEngine.Types.TraceEvents.TraceEventLayoutShift): HighlightedEntryInfo {
    const title = this.titleForEvent(event);
    return {title, formattedTime: getFormattedTime(event.dur)};
  }
}

export async function drawLayoutShiftScreenshotRects(
    event: TraceEngine.Types.TraceEvents.SyntheticLayoutShift,
    contentHelper: Timeline.TimelineUIUtils.TimelineDetailsContentHelper,
    traceParseData:
        Readonly<TraceEngine.Handlers.Types.EnabledHandlerDataWithMeta<typeof TraceEngine.Handlers.ModelHandlers>>):
    Promise<void> {
  const screenshots = event.parsedData.screenshots;
  const viewport = traceParseData.Meta.viewportRect;
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
  const dpr = traceParseData.Meta.devicePixelRatio;

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
  contentHelper.appendElementRow('', screenshotContainer);

  // If this is being size constrained, it needs to be done in JS (rather than css max-width, etc)....
  // That's because this function is complete before the contentHelper adds it to the DOM.. so we can't query offsetHeight for its resolved size…
  const maxHeight = 300;
  const maxWidth = 500;
  const scaleFactor = Math.min(maxWidth / beforeImage.naturalWidth, maxHeight / beforeImage.naturalHeight);
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
}

// TODO make the below be for layotushifts
interface DialogTraceEngineData {
  source: 'TraceEngine';
  index: number;
  zeroTime: TraceEngine.Types.Timing.MilliSeconds;
  frames: readonly TraceEngine.Extras.FilmStrip.Frame[];
}

export class Dialog {
  private fragment: UI.Fragment.Fragment;
  private readonly widget: UI.XWidget.XWidget;
  private index: number;
  private dialog: UI.Dialog.Dialog|null = null;

  #data: DialogTraceEngineData;

  static fromFilmStrip(filmStrip: TraceEngine.Extras.FilmStrip.Data, selectedFrameIndex: number): Dialog {
    const data: DialogTraceEngineData = {
      source: 'TraceEngine',
      frames: filmStrip.frames,
      index: selectedFrameIndex,
      zeroTime: TraceEngine.Helpers.Timing.microSecondsToMilliseconds(filmStrip.zeroTime),
    };
    return new Dialog(data);
  }

  private constructor(data: DialogTraceEngineData) {
    this.#data = data;
    this.index = data.index;
    const prevButton = UI.UIUtils.createTextButton('\u25C0', this.onPrevFrame.bind(this));
    UI.Tooltip.Tooltip.install(prevButton, i18nString(UIStrings.previousFrame));
    const nextButton = UI.UIUtils.createTextButton('\u25B6', this.onNextFrame.bind(this));
    UI.Tooltip.Tooltip.install(nextButton, i18nString(UIStrings.nextFrame));
    this.fragment = UI.Fragment.Fragment.build`
      <x-widget flex=none margin=12px>
        <x-hbox overflow=auto border='1px solid #ddd'>
          <img $='image' data-film-strip-dialog-img style="max-height: 80vh; max-width: 80vw;"></img>
        </x-hbox>
        <x-hbox x-center justify-content=center margin-top=10px>
          ${prevButton}
          <x-hbox $='time' margin=8px></x-hbox>
          ${nextButton}
        </x-hbox>
      </x-widget>
    `;
    this.widget = (this.fragment.element() as UI.XWidget.XWidget);
    (this.widget as HTMLElement).tabIndex = 0;
    this.widget.addEventListener('keydown', this.keyDown.bind(this), false);
    this.dialog = null;

    void this.render();
  }

  hide(): void {
    if (this.dialog) {
      this.dialog.hide();
    }
  }

  #framesCount(): number {
    return this.#data.frames.length;
  }

  #zeroTime(): TraceEngine.Types.Timing.MilliSeconds {
    return this.#data.zeroTime;
  }

  private resize(): void {
    if (!this.dialog) {
      this.dialog = new UI.Dialog.Dialog();
      this.dialog.contentElement.appendChild(this.widget);
      this.dialog.setDefaultFocusedElement(this.widget);
      this.dialog.show();
    }
    this.dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
  }

  private keyDown(event: Event): void {
    const keyboardEvent = (event as KeyboardEvent);
    switch (keyboardEvent.key) {
      case 'ArrowLeft':
        if (Host.Platform.isMac() && keyboardEvent.metaKey) {
          this.onFirstFrame();
        } else {
          this.onPrevFrame();
        }
        break;

      case 'ArrowRight':
        if (Host.Platform.isMac() && keyboardEvent.metaKey) {
          this.onLastFrame();
        } else {
          this.onNextFrame();
        }
        break;

      case 'Home':
        this.onFirstFrame();
        break;

      case 'End':
        this.onLastFrame();
        break;
    }
  }

  private onPrevFrame(): void {
    if (this.index > 0) {
      --this.index;
    }
    void this.render();
  }

  private onNextFrame(): void {
    if (this.index < this.#framesCount() - 1) {
      ++this.index;
    }
    void this.render();
  }

  private onFirstFrame(): void {
    this.index = 0;
    void this.render();
  }

  private onLastFrame(): void {
    this.index = this.#framesCount() - 1;
    void this.render();
  }

  private render(): void {
    const frame = this.#data.frames[this.index];
    const timestamp = TraceEngine.Helpers.Timing.microSecondsToMilliseconds(frame.screenshotEvent.ts);
    this.fragment.$('time').textContent = i18n.TimeUtilities.millisToString(timestamp - this.#zeroTime());
    const image = (this.fragment.$('image') as HTMLImageElement);
    image.setAttribute('data-frame-index', this.index.toString());
    FilmStripView.setImageData(image, frame.screenshotEvent.args.dataUri);
    this.resize();
  }
}
