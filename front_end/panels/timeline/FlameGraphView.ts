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
  startTime: Trace.Types.Timing.Micro = Trace.Types.Timing.Micro(0);
  endTime: Trace.Types.Timing.Micro = Trace.Types.Timing.Micro(Infinity);

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
    // this.delegate.windowChanged(startTime, endTime, animate);
    console.log('windowChanged called with:', startTime, endTime, animate);
  }
  updateRangeSelection(startTime: number, endTime: number): void {
    // this.delegate.updateRangeSelection(startTime, endTime);
    console.log('updateRangeSelection called with:', startTime, endTime);
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
      startTime: Trace.Helpers.Timing.microToMilli(this.startTime),
      endTime: Trace.Helpers.Timing.microToMilli(this.endTime),
      doNotAggregate: false,
      eventGroupIdCallback: null,
      includeInstantEvents: false,
    });

    let now = performance.now();


    this.#dataProvider.buildAggregatedTree(this.#selectedEvents, this.startTime, this.endTime, this.#parsedTrace);
    console.log(performance.measure('buildAggregatedTree', {start: now, end: performance.now()}));

    now = performance.now();
    // this.#dataProvider.setTree(tree, this.#parsedTrace);
    console.log(performance.measure('setTree', {start: now, end: performance.now()}));
    this.#flameChart.scheduleUpdate();
  }

  updateContents(selection: TimelineSelection): void {
    const timings = rangeForSelection(selection);
    // const timingMilli = Trace.Helpers.Timing.traceWindowMicroSecondsToMilliSeconds(timings);
    this.startTime = timings.min;
    this.endTime = timings.max;
    this.#flameChart.setWindowTimes(0, 99 + Math.random());
    // this.#dataProvider.setRange(timings);


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
  treeRoot: {name: string; value: number; children: Map<any, any>;};
  indexedEvents: any;


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

  // setRange(timingMilli: Trace.Types.Timing.TraceWindowMilli): void {
  //   // const {min, max} = timingMilli;
  //   // this.#minimumBoundary = min;
  //   // this.timeSpan = min === max ? 1000 : max - this.#minimumBoundary;
  // }

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

    function processNode(node: Trace.Extras.TraceTree.Node, level: number, parentAbsoluteStartTime: number): void {
      if (level > maxDepth) {
        maxDepth = level;
      }
      if (node.event) {
        // The start time of the current node.
        // This is the parent's absolute start time PLUS the x-offset accumulated at this level.
        const nodeAbsoluteStartTime = Math.max(parentAbsoluteStartTime, xOffsets[level] || 0);

        // The total time of the node, converted to a percentage of the overall trace.
        // This seems correct for width calculation.
        const nodeTotalTime = node.totalTime / tree.totalTime * 100;

        entryLevels.push(level);
        entryStartTimes.push(nodeAbsoluteStartTime);  // Use the calculated absolute start time
        entryTotalTimes.push(nodeTotalTime);

        // Update the xOffset for the current level.
        // This ensures subsequent siblings at the same level start after this node.
        xOffsets[level] = nodeAbsoluteStartTime + nodeTotalTime;
      }


      for (const child of node.children().values()) {
        // When processing a child, its parent's absolute start time is the current node's absolute start time.
        // If the current node doesn't have an event (e.g., it's a root node without a direct event),
        // then we'd use the current `parentAbsoluteStartTime` passed into `processNode`.
        const childParentAbsoluteStartTime =
            node.event ? entryStartTimes[entryStartTimes.length - 1] : parentAbsoluteStartTime;
        processNode(child, level + 1, childParentAbsoluteStartTime);
      }
    }

    // Initial call for the root's children. The initial parentAbsoluteStartTime is 0.
    for (const child of this.#tree.children().values()) {
      processNode(child, 0, 0);
    }
    this.#maxDepth = maxDepth;
  }


  buildAggregatedTree(
      events: Trace.Types.Events.Event[], startTime: Trace.Types.Timing.Micro = Trace.Types.Timing.Micro(0),
      endTime: Trace.Types.Timing.Micro = Trace.Types.Timing.Micro(Infinity),
      parsedTrace: Trace.Handlers.Types.ParsedTrace): Trace.Extras.TraceTree.Node {
    // filter selectedEvents down to only those that are visible in the current time range


    this.#parsedTrace = parsedTrace;


    const eventsInRange = events.filter(event => {
      if (event.ph === 'I' || event.dur === 0) {
        return false;  // Ignore instant events
      }
      if (event.ts < startTime || (event.ts + (event.dur ?? 0)) > endTime) {
        return false;  // Ignore events outside the current time range
      }
      return true;
    });

    // 1. Decompose events into start and end points
    const points = [];
    for (const event of eventsInRange) {
      if (event.ph === 'I' || event.dur === 0)
        continue;
      // Basic data validation
      if (typeof event.ts !== 'number' || typeof event.dur !== 'number' || isNaN(event.ts) || isNaN(event.dur)) {
        console.warn('Skipping invalid event:', event);
        continue;
      }
      event.badnest = '';
      points.push({ts: event.ts, type: 'start', event});
      points.push({ts: event.ts + event.dur, type: 'end', event});
    }


    const nodeToEvent = new Map<any, Trace.Types.Events.Event>();

    // 2. Sort points: primary by timestamp, secondary by type ('end' before 'start')
    points.sort((a, b) => {
      if (a.ts !== b.ts) {
        return a.ts - b.ts;
      }
      // If timestamps are equal, 'end' events should come first.
      return a.type === 'end' ? -1 : 1;
    });

    const root = {name: 'root', value: 0, children: new Map()};
    const stack = [root];


    for (const point of points) {
      const parentNode = stack[stack.length - 1];

      if (point.type === 'start') {
        const event = point.event;
        let childNode = parentNode.children.get(event.name);

        if (!childNode) {
          childNode = {
            name: event.name,
            event: event,
            value: 0,
            children: new Map(),
            // Store a reference to the event that created this node instance on the stack
            // This helps in validating the 'end' event.
            _originatingEventName: event.name
          };
          nodeToEvent.set(childNode, event);
          parentNode.children.set(event.name, childNode);
        }

        childNode.value += event.dur;
        stack.push(childNode);

      } else {  // 'end'
        // --- ROBUSTNESS FIX ---
        // If the stack is empty or only has the root, we can't pop.
        // This indicates a mismatched 'end' event (e.g., from a truncated trace).
        if (stack.length <= 1) {
          console.warn('Mismatched "end" event (stack empty or at root):', point.event.name);
          continue;
        }

        // Check if the event at the top of the stack matches the 'end' event we're processing.
        // This handles interleaved events.
        if (parentNode._originatingEventName === point.event.name) {
          // This is the normal, correct case.
          stack.pop();
        } else {
          // The data is improperly nested. An event is ending, but it's not the
          // one at the top of the stack.
          console.warn(
              `Interleaved event detected. Trying to end "${point.event.name}" but "${
                  parentNode._originatingEventName}" is at the top of the stack. Attempting to self-heal.`,
              parentNode.event, point.event);
          point.event.badnest = (point.event.badnest || '') + ' TL ending.';
          parentNode.event.badnest = (parentNode.event.badnest || '') + ' TL @top.';

          // Search down the stack to find the correct event to pop.
          let found = false;
          for (let i = stack.length - 1; i > 0; i--) {  // i > 0 to protect the root
            if (stack[i]._originatingEventName === point.event.name) {
              // We found it. Pop everything above it.
              stack.length = i;  // Effectively pops everything from i upwards
              found = true;
              break;
            }
          }
          if (!found) {
            console.warn(`Could not find matching start for event "${point.event.name}" in the current stack.`);
          }
        }
      }
    }

    root.value = Array.from(root.children.values()).reduce((sum, child) => sum + child.value, 0);

    this.treeRoot = root;



    // 3. Populate timeline data for the flame chart.
    // This logic is adapted from your original `setTree` method. It traverses the
    // aggregated tree to generate the necessary arrays for rendering.
    this.#timelineData = PerfUI.FlameChart.FlameChartTimelineData.createEmpty();

    const totalTime = root.value;
    if (totalTime === 0) {
      this.#maxDepth = 0;
      return root;
    }

    let maxDepth = 0;
    const {entryLevels, entryStartTimes, entryTotalTimes} = this.#timelineData;
    this.indexedEvents = [];
    const xOffsets: number[] = [];

    // Define a recursive function to traverse the aggregated tree.
    const processAggregatedNode = (node: any, level: number, parentAbsoluteStartTime: number): void => {
      if (level > maxDepth) {
        maxDepth = level;
      }

      // The start time for a node is the greater of its parent's start time or the
      // current offset at its level. This creates the flame chart's horizontal layout.
      const nodeAbsoluteStartTime = Math.max(parentAbsoluteStartTime, xOffsets[level] || 0);

      // The width of the node is its aggregated duration as a percentage of the total.
      const nodeTotalTime = (node.value / totalTime) * 100;

      entryLevels.push(level);
      this.indexedEvents.push(nodeToEvent.get(node));

      entryStartTimes.push(nodeAbsoluteStartTime);
      entryTotalTimes.push(nodeTotalTime);

      // Update the offset for the current level to position the next sibling correctly.
      xOffsets[level] = nodeAbsoluteStartTime + nodeTotalTime;

      // The parent start time for any children is this node's calculated start time.
      const children = Array.from(node.children.values());
      // Sort children for a stable and predictable flame chart layout.
      // children.sort((a, b) => b.value - a.value);

      for (const child of children) {
        processAggregatedNode(child, level + 1, nodeAbsoluteStartTime);
      }
    };

    // Begin processing with the top-level children of the root node.
    const topLevelNodes = Array.from(root.children.values());
    // Sort top-level nodes by aggregated time (value) for a more readable chart.
    // topLevelNodes.sort((a, b) => b.value - a.value);

    for (const child of topLevelNodes) {
      processAggregatedNode(child, 0, 0);
    }

    this.#maxDepth = maxDepth;

    return root;
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
    popoverElement.textContent = this.entryTitle(entryIndex)
    popoverElement.appendChild(fragment);
    return popoverElement;
  }

  canJumpToEntry(entryIndex: number): boolean {
    return false;
  }

  entryTitle(entryIndex: number): string|null {
    const timelineData = this.#timelineData;
    const eventLevel = timelineData.entryLevels[entryIndex];
    const event = this.#getEvent(entryIndex);
    if (!event) {
      return '';
    }

    return Utils.EntryName.nameForEntry(event, this.#parsedTrace ?? undefined);
  }


  entryFont(entryIndex: number): string|null {
    return null;
  }

  entryColor(entryIndex: number): string {
    const event = this.#getEvent(entryIndex);
    const timelineData = this.#timelineData;
    const eventLevel = timelineData.entryLevels[entryIndex];

    if (!event) {
      return '';
    }

    try {
      return this.#parsedTrace.compatibilityTracksAppender?.colorForEvent(event, eventLevel);
    } catch (e) {
      return TimelineUIUtils.eventStyle(event).category.color;
    }
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
    return this.indexedEvents[entryIndex];

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
