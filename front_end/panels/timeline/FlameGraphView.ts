// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-imperative-dom-api */

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Trace from '../../models/trace/trace.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as LegacyComponents from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';

import {Category, IsLong} from './TimelineFilters.js';
import type {TimelineModeViewDelegate} from './TimelinePanel.js';
import {rangeForSelection, type TimelineSelection} from './TimelineSelection.js';
import {TimelineTreeView} from './TimelineTreeView.js';
import {TimelineUIUtils} from './TimelineUIUtils.js';
import * as Utils from './utils/utils.js';

const UIStrings = {
  /**
   *@description Text for the start time of an activity
   */
  startTime: 'Start time',
} as const;
const str_ = i18n.i18n.registerUIStrings('panels/timeline/FlameGraphView.ts', UIStrings);
i18n.i18n.getLocalizedString.bind(undefined, str_);

export class FlameGraphView extends Common.ObjectWrapper.eventMixin<TimelineTreeView.EventTypes, typeof UI.Widget.VBox>(
    UI.Widget.VBox) implements UI.SearchableView.Searchable, PerfUI.FlameChart.FlameChartDelegate {
  private searchResults: Trace.Extras.TraceTree.Node[] = [];
  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #entityMapper: Utils.EntityMapper.EntityMapper|null = null;
  #selectedEvents: Trace.Types.Events.Event[]|null = null;
  #dataProvider: DataProvider;
  #flameChart: PerfUI.FlameChart.FlameChart;

  currentResult?: number;
  startTime: Trace.Types.Timing.Milli = Trace.Types.Timing.Milli(0);
  endTime: Trace.Types.Timing.Milli = Trace.Types.Timing.Milli(Infinity);

  constructor(
      private readonly delegate: TimelineModeViewDelegate,
      private readonly category: Category,
      private readonly isLong: IsLong,
  ) {
    super(true);
    this.element.classList.add('timeline-flame-graph-view');
    this.element.tabIndex = -1;
    this.setDefaultFocusedElement(this.element);
    this.element.setAttribute('jslog', `${VisualLogging.pane('flamegraph').track({resize: true})}`);

    this.#dataProvider = new DataProvider();
    this.#flameChart = new PerfUI.FlameChart.FlameChart(this.#dataProvider, this);
    this.#flameChart.show(this.contentElement);
  }

  windowChanged(startTime: number, endTime: number, animate: boolean): void {
    this.delegate.windowChanged(startTime, endTime, animate);
  }
  updateRangeSelection(startTime: number, endTime: number): void {
    this.delegate.updateRangeSelection(startTime, endTime);
  }
  updateSelectedGroup(flameChart: PerfUI.FlameChart.FlameChart, group: PerfUI.FlameChart.Group|null): void {
    // TODO(crbug.com/1428148): Implement group selection.
  }

  setModelWithEvents(
      selectedEvents: Trace.Types.Events.Event[]|null,
      parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null,
      entityMappings: Utils.EntityMapper.EntityMapper|null = null,
      ): void {
    this.#parsedTrace = parsedTrace;
    this.#selectedEvents = selectedEvents;
    this.#entityMapper = entityMappings;
    this.refreshTree();
  }

  refreshTree(): void {
    if (!this.isShowing() || !this.#selectedEvents || !this.#selectedEvents.length || !this.#parsedTrace) {
      return;
    }

    const visibleEventsFilter = new Trace.Extras.TraceFilter.VisibleEventsFilter(Utils.EntryStyles.visibleTypes());

    const tree = new Trace.Extras.TraceTree.TopDownRootNode(this.#selectedEvents, {
      filters: [visibleEventsFilter],
      startTime: this.startTime,
      endTime: this.endTime,
      doNotAggregate: false,
      eventGroupIdCallback: null,
      includeInstantEvents: false,
    });

    this.#dataProvider.setTree(tree, this.#parsedTrace);
    this.#flameChart.scheduleUpdate();
  }

  updateContents(selection: TimelineSelection): void {
    const timings = rangeForSelection(selection);
    const timingMilli = Trace.Helpers.Timing.traceWindowMicroSecondsToMilliSeconds(timings);
    this.startTime = timingMilli.min;
    this.endTime = timingMilli.max;
    this.#flameChart.setWindowTimes(0, 99 + Math.random());
    this.#dataProvider.setRange(timingMilli);


    this.refreshTree();
  }

  // UI.SearchableView.Searchable implementation

  onSearchCanceled(): void {
    this.searchResults = [];
    this.currentResult = 0;
  }

  performSearch(searchConfig: UI.SearchableView.SearchConfig, _shouldJump: boolean, _jumpBackwards?: boolean): void {
    this.searchResults = [];
    this.currentResult = 0;
  }

  jumpToNextSearchResult(): void {
    if (!this.searchResults.length || this.currentResult === undefined) {
      return;
    }
  }

  jumpToPreviousSearchResult(): void {
    if (!this.searchResults.length || this.currentResult === undefined) {
      return;
    }
  }

  supportsCaseSensitiveSearch(): boolean {
    return true;
  }

  supportsRegexSearch(): boolean {
    return true;
  }
}

class DataProvider implements PerfUI.FlameChart.FlameChartDataProvider {
  #tree: Trace.Extras.TraceTree.TopDownRootNode|null = null;
  #timelineData: PerfUI.FlameChart.FlameChartTimelineData;
  #parsedTrace: Trace.Handlers.Types.ParsedTrace|null = null;
  #maxDepth: number = 0;
  private timeSpan: number = 100;
  #minimumBoundary: number = 0;


  constructor() {
    this.#timelineData = PerfUI.FlameChart.FlameChartTimelineData.createEmpty();
  }

  // TODO(crbug.com/40256158): Implement formatValue
  formatValue(value: number, entryIndex: number): string {
    return value.toFixed(2);
  }

  // TODO(crbug.com/40256158): Implement preparePopoverElement
  async preparePopoverElement(entryIndex: number): Promise<Element|null> {
    const element = document.createElement('div');
    element.textContent = `Entry Index: ${entryIndex}`;
    return element;
  }

  // TODO(crbug.com/40256158): Implement hasTrackConfigurationMode
  hasTrackConfigurationMode(): boolean {
    return false;
  }

  setRange(timingMilli: Trace.Types.Timing.TraceWindowMilli): void {
    // const {min, max} = timingMilli;
    // this.#minimumBoundary = min;
    // this.timeSpan = min === max ? 1000 : max - this.#minimumBoundary;
  }

  setTree(tree: Trace.Extras.TraceTree.TopDownRootNode, parsedTrace: Trace.Handlers.Types.ParsedTrace): void {
    this.#tree = tree;
    this.#parsedTrace = parsedTrace;
    this.#timelineData = PerfUI.FlameChart.FlameChartTimelineData.createEmpty();
    if (!this.#tree) {
      return;
    }
    let maxDepth = 0;
    const {entryLevels, entryStartTimes, entryTotalTimes} = this.#timelineData;
    const xOffsets: number[] = [];

    function processNode(
        node: Trace.Extras.TraceTree.Node, level: number): void {
      if (level > maxDepth) {
        maxDepth = level;
      }
      if (node.event) {
        const x = xOffsets[level] || 0;
        entryLevels.push(level);
        entryStartTimes.push(x);
        const nodeTotalTime = node.totalTime / tree.totalTime * 100;
        entryTotalTimes.push(nodeTotalTime);
        xOffsets[level] = x + nodeTotalTime;
      }
      for (const child of node.children().values()) {
        processNode(child, level + 1);
      }
    }

    for (const child of this.#tree.children().values()) {
      processNode(child, 0);
    }
    this.#maxDepth = maxDepth;
  }

  minimumBoundary(): number {
    return 0;
  }

  totalTime(): number {
    return 100;
  }

  maxStackDepth(): number {
    return this.#maxDepth;
  }

  timelineData(): PerfUI.FlameChart.FlameChartTimelineData {
    return this.#timelineData;
  }

  async preparePopover(entryIndex: number): Promise<Element|null> {
    if (!this.#tree || !this.#parsedTrace) {
      return null;
    }
    const event = this.#getEvent(entryIndex);
    if (!event) {
      return null;
    }
    const linkifier = new LegacyComponents.Linkifier.Linkifier();
    const fragment = await TimelineUIUtils.buildTraceEventDetails(
        this.#parsedTrace, event, linkifier, false, null);
    const popoverElement = document.createElement('div');
    popoverElement.appendChild(fragment);
    return popoverElement;
  }

  canJumpToEntry(entryIndex: number): boolean {
    return false;
  }

  entryTitle(entryIndex: number): string|null {
    const event = this.#getEvent(entryIndex);
    if (!event) {
      return '';
    }
    return TimelineUIUtils.eventStyle(event).title;
  }

  entryFont(entryIndex: number): string|null {
    return null;
  }

  entryColor(entryIndex: number): string {
    const event = this.#getEvent(entryIndex);
    if (!event) {
      return '';
    }
    return TimelineUIUtils.eventStyle(event).category.color;
  }

  decorateEntry(
      entryIndex: number, context: CanvasRenderingContext2D, text: string|null, barX: number, barY: number,
      barWidth: number, barHeight: number, unclippedBarX: number, timeToPixelRatio: number): boolean {
    return false;
  }

  forceDecoration(entryIndex: number): boolean {
    return false;
  }

  textColor(entryIndex: number): string {
    return '#333';
  }

  #getEvent(entryIndex: number): Trace.Types.Events.Event|null {
    if (!this.#tree) {
      return null;
    }
    // This is a bit of a hack to get the event from the tree.
    // We should probably store the events in the data provider.
    let i = 0;
    function findEvent(node: Trace.Extras.TraceTree.Node): Trace.Types.Events.Event|null {
      if (node.event) {
        if (i === entryIndex) {
          return node.event;
        }
        i++;
      }
      for (const child of node.children().values()) {
        const event = findEvent(child);
        if (event) {
          return event;
        }
      }
      return null;
    }
    for (const child of this.#tree.children().values()) {
      const event = findEvent(child);
      if (event) {
        return event;
      }
    }
    return null;
  }
}
