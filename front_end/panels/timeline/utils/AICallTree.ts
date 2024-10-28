// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Trace from '../../../models/trace/trace.js';

import {nameForEntry} from './EntryName.js';
import {visibleTypes} from './EntryStyles.js';
import {SourceMapsResolver} from './SourceMapsResolver.js';

/*
const METADATA_VALUES = {
  Node: 900,
  selected: 1000,
  dur: 200,
  self: 500,
  snippet: 700,  // Potentially useful, but can be very long
  'URL#': 300,
  children: 400,
};
*/

/**
 * Approximate token counts guidance for weight calculation
 *
 * numbers equivalent to num.toString().length (count of digits incl decimal)
 */

/*

Node: 7+, plus extra for words or higher nodeid digit counts.
Selected: 4
dur: 5+
self: 5+
URL#: 5
snippet: minimum 25, up to 200
Having children: 3
  Each child 7+, plus extra for words

 */

/** Iterates from a node down through its descendents. If the callback returns true, the loop stops. */
function depthFirstWalk(
    nodes: MapIterator<Trace.Extras.TraceTree.Node>, callback: (arg0: Trace.Extras.TraceTree.Node) => void|true): void {
  for (const node of nodes) {
    if (callback?.(node)) {
      break;
    }
    depthFirstWalk(node.children().values(), callback);  // Go deeper.
  }
}

export class AICallTree {
  rootNode: TimelineModel.TimelineProfileTree.TopDownRootNode|null = null;
  selectedNode: TimelineModel.TimelineProfileTree.TopDownRootNode|null = null;
  constructor(
      public selectedEvent: Trace.Types.Events.Event,
      public parsedTrace: Trace.Handlers.Types.ParsedTrace,
  ) {
  }


  /**
   * Attempts to build an AICallTree from a given selected event. It also
   * validates that this event is one that we support being used with the AI
   * Assistance panel, which [as of January 2025] means:
   * 1. It is on the main thread.
   * 2. It exists in either the Renderer or Sample handler's entryToNode map.
   * This filters out other events we make such as SyntheticLayoutShifts which are not valid
   * If the event is not valid, or there is an unexpected error building the tree, `null` is returned.
   */
  static from(selectedEvent: Trace.Types.Events.Event, parsedTrace: Trace.Handlers.Types.ParsedTrace): AICallTree|null {
    // First: check that the selected event is on the thread we have identified as the main thread.
    const threads = Trace.Handlers.Threads.threadsInTrace(parsedTrace);
    const thread = threads.find(t => t.pid === selectedEvent.pid && t.tid === selectedEvent.tid);
    if (!thread) {
      return null;
    }
    // We allow two thread types to deal with the NodeJS use case.
    // MAIN_THREAD is used when a trace has been generated through Chrome
    //   tracing on a website (and we have a renderer)
    // CPU_PROFILE is used only when we have received a CPUProfile - in this
    //   case all the threads are CPU_PROFILE so we allow those. If we only allow
    //   MAIN_THREAD then we wouldn't ever allow NodeJS users to use the AI
    //   integration.
    if (thread.type !== Trace.Handlers.Threads.ThreadType.MAIN_THREAD &&
        thread.type !== Trace.Handlers.Threads.ThreadType.CPU_PROFILE) {
      return null;
    }

    // Ensure that the event is known to either the Renderer or Samples
    // handler. This helps exclude synthetic events we build up for other
    // information such as Layout Shift clusters.
    // We check Renderer + Samples to ensure we support CPU Profiles (which do
    // not populate the Renderer Handler)
    if (!parsedTrace.Renderer.entryToNode.has(selectedEvent) && !parsedTrace.Samples.entryToNode.has(selectedEvent)) {
      return null;
    }

    const instance = new AICallTree(selectedEvent, parsedTrace);
    instance.optimize();
    instance.logDebug();
    return instance;
  }

  optimize() {
    const selectedEvent = this.selectedEvent;
    const {startTime, endTime} = Trace.Helpers.Timing.eventTimingsMilliSeconds(selectedEvent);

    const selectedEventBounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(
        Trace.Helpers.Timing.milliToMicro(startTime), Trace.Helpers.Timing.milliToMicro(endTime));
    let threadEvents = parsedTrace.Renderer.processes.get(selectedEvent.pid)?.threads.get(selectedEvent.tid)?.entries;
    if (!threadEvents) {
      // None from the renderer: try the samples handler, this might be a CPU trace.
      threadEvents =
          this.parsedTrace.Samples.profilesInProcess.get(selectedEvent.pid)?.get(selectedEvent.tid)?.profileCalls;
    }

    if (!threadEvents) {
      console.warn(`AICallTree: could not find thread for selected entry: ${selectedEvent}`);
      return null;
    }
    const overlappingEvents = threadEvents.filter(e => Trace.Helpers.Timing.eventIsInBounds(e, selectedEventBounds));

    const visibleEventsFilter = new Trace.Extras.TraceFilter.VisibleEventsFilter(visibleTypes());
    const customFilter = new AITreeFilter(selectedEvent);
    // Build a tree bounded by the selected event's timestamps, and our other filters applied

    const rootNode = new Trace.Extras.TraceTree.TopDownRootNode(overlappingEvents, {
      filters: [visibleEventsFilter, customFilter],
      startTime,
      endTime,
      includeInstantEvents: true,
    });

    // Walk the tree to find selectedNode
    let selectedNode: Trace.Extras.TraceTree.Node|null = null;
    depthFirstWalk([rootNode].values(), node => {
      if (node.event === selectedEvent) {
        selectedNode = node;
        return true;
      }
      return;
    });

    if (selectedNode === null) {
      console.warn(`Selected event ${selectedEvent} not found within its own tree.`);
      return null;
    }

    this.rootNode = rootNode;
    this.selectedNode = selectedNode;
    // this.annotateNode(this.rootNode);
    // this.calculateMetrics(this.rootNode);
  }


  // annotateNode(
  //     node: TimelineModel.TimelineProfileTree.Node, currentDepth = 0,
  //     pathToSelected: TimelineModel.TimelineProfileTree.Node[] = []) {
  //   if (!this.rootNode || !this.selectedNode) {
  //     throw new Error('Not set');
  //   }

  //   node.depth = currentDepth;

  //   if (node.event === this.selectedNode.event) {
  //     node.onSelectedPath = true;
  //     pathToSelected = [...pathToSelected, node];
  //   }

  //   node.distanceToSelected = pathToSelected.length;

  //   for (const child of node.children().values()) {
  //     this.annotateNode(child, currentDepth + 1, node.onSelectedPath ? [...pathToSelected, node] : pathToSelected);
  //   }
  // }

  // calculateMetrics(node: TimelineModel.TimelineProfileTree.Node) {
  //   // todo remove hacks
  //   node.dur = node.totalTime;
  //   node.self = node.selfTime;
  //   node.snippet = '';

  //   // Base values (adjust as needed)
  //   let value = 900 + 200 * node.dur + 500 * node.self + (node.url ? 300 : 0) + (node.snippet ? 700 : 0) +
  //       400 * node.children.length;
  //   let weight = 7 + (node.url ? 5 : 0) + (node.snippet ? Math.min(200, Math.max(25, node.snippet.length / 10)) : 0) +
  //       3 * node.children.length;

  //   // Boosts
  //   if (node.depth === 0) {
  //     value *= 5;  // Root boost
  //   } else if (node.depth === 1) {
  //     value *= 3;  // Second level boost
  //   }
  //   if (node.onSelectedPath) {
  //     value *= 10;  // Selected path boost
  //   }
  //   if (node.self > 0) {
  //     value *= 1.25;  // Self duration boost
  //   }

  //   // Distance-based boost (exponential decay)
  //   if (node.distanceToSelected !== undefined) {
  //     const distanceFactor = Math.pow(0.8, node.distanceToSelected);  // Adjust decay factor as needed
  //     value *= distanceFactor;
  //   }

  //   // Child weight calculation
  //   weight += node.children().values().reduce((acc, child) => acc + this.calculateMetrics(child), 0);

  //   node.value = value;
  //   node.weight = weight;

  //   return weight;  // Return weight for parent's calculation
  // }

  // buildOptimizedTree(node: TimelineModel.TimelineProfileTree.Node, remainingTokens: number):
  //     TimelineModel.TimelineProfileTree.Node|null {
  //   if (remainingTokens <= 0) {
  //     return null;  // Token limit reached
  //   }

  //   const newNode: TimelineModel.TimelineProfileTree.Node = {
  //     id: node.id,
  //     event: node.event,
  //     value: node.value,
  //     weight: node.weight,
  //     dur: node.dur,
  //     self: node.self,
  //     children: [],
  //   };

  //   let tokensUsed = 7 + (node.dur ? 5 : 0) + (node.self ? 5 : 0);  // Base node weight

  //   // Always include selected path nodes
  //     newNode.url = node.url;
  //     newNode.snippet = node.snippet;
  //     tokensUsed += (node.url ? 5 : 0) + (node.snippet ? Math.min(200, Math.max(25, node.snippet.length / 10)) : 0);
  //   if (node.onSelectedPath) {

  //   } else {
  //     // Include optional fields based on value/weight ratio
  //     const valueWeightRatioThreshold = 10;  // Adjust as needed

  //     if (node.url && (node.value || 0) / (node.weight || 1) > valueWeightRatioThreshold) {
  //       newNode.url = node.url;
  //       tokensUsed += 5;
  //     }

  //     if (node.snippet &&
  //         (node.value || 0) / (node.weight || 1) > valueWeightRatioThreshold * 2) {  // Higher threshold for snippet
  //       newNode.snippet = node.snippet;
  //       tokensUsed += Math.min(200, Math.max(25, node.snippet.length / 10));
  //     }
  //   }

  //   remainingTokens -= tokensUsed;

  //   // Process children
  //   if (remainingTokens > 3 && node.children.length > 0) {  // 3 tokens for "children" field
  //     remainingTokens -= 3;
  //     newNode.children = Array.from(node.children().values())
  //                            .sort(
  //                                (a, b) => (b.value || 0) / (b.weight || 1) -
  //                                    (a.value || 0) / (a.weight || 1))  // Sort by value/weight ratio
  //                            .map(child => this.buildOptimizedTree(child, remainingTokens))
  //                            .filter((child): child is TimelineModel.TimelineProfileTree.Node => child !== null);
  //   }

  //   return newNode;
  // }


  /** Define precisely how the call tree is serialized. Typically called from within `PerformanceAgent` */
  serialize(): string {
    if (!this.rootNode || !this.selectedNode) {
      throw new Error('Not set');
    }
    const {selectedNode} = this;
    const ok = new TreeOptimizer(this.rootNode, this.selectedNode);
    const yeah = ok.optimize();
    debugger;
    // const optimizedRoot = this.buildOptimizedTree(this.rootNode, 30_000);
    // debugger;

    const nodeToIdMap = new Map<Trace.Extras.TraceTree.Node, number>();
    // Keep a map of URLs. We'll output a LUT to keep size down.
    const allUrls: string[] = [];

    let nodesStr = '';
    depthFirstWalk(this.rootNode.children().values(), node => {
      nodesStr += AICallTree.stringifyNode(node, this.parsedTrace, selectedNode, nodeToIdMap, allUrls);
    });

    let output = '';
    if (allUrls.length) {
      // Output lookup table of URLs within this tree
      output += '\n# All URL #s:\n\n' + allUrls.map((url, index) => `  * ${index}: ${url}`).join('\n');
    }
    output += '\n\n# Call tree:' + nodesStr;
    return output;
  }

  /* This custom YAML-like format with an adjacency list for children is 35% more token efficient than JSON */
  static stringifyNode(
      node: Trace.Extras.TraceTree.Node, parsedTrace: Trace.Handlers.Types.ParsedTrace,
      selectedNode: Trace.Extras.TraceTree.Node, nodeToIdMap: Map<Trace.Extras.TraceTree.Node, number>,
      allUrls: string[]): string {
    const event = node.event;
    if (!event) {
      throw new Error('Event required');
    }

    const url = SourceMapsResolver.resolvedURLForEntry(parsedTrace, event);
    // Get the index of the URL within allUrls, and push if needed. Set to -1 if there's no URL here.
    const urlIndex = !url ? -1 : allUrls.indexOf(url) === -1 ? allUrls.push(url) - 1 : allUrls.indexOf(url);
    const children = Array.from(node.children().values());

    // Identifier string includes an id and name:
    //   eg "[13] Parse HTML" or "[45] parseCPUProfileFormatFromFile"
    const getIdentifier = (node: Trace.Extras.TraceTree.Node): string => {
      if (!node.event || typeof node.id !== 'string') {
        throw new Error('ok');
      }
      if (!nodeToIdMap.has(node)) {
        nodeToIdMap.set(node, nodeToIdMap.size + 1);
      }
      return `${nodeToIdMap.get(node)} – ${nameForEntry(node.event, parsedTrace)}`;
    };

    // Round milliseconds because we don't need the precision
    const roundToTenths = (num: number): number => Math.round(num * 10) / 10;

    // Build a multiline string describing this callframe node
    const lines = [
      `\n\nNode: ${getIdentifier(node)}`,
      selectedNode === node && 'Selected: true',
      node.totalTime && `dur: ${roundToTenths(node.totalTime)}`,
      // node.functionSource && `snippet: ${node.functionSource.slice(0, 250)}`,
      node.selfTime && `self: ${roundToTenths(node.selfTime)}`,
      urlIndex !== -1 && `URL #: ${urlIndex}`,
    ];
    if (children.length) {
      lines.push('Children:');
      lines.push(...children.map(node => `  * ${getIdentifier(node)}`));
    }
    return lines.filter(Boolean).join('\n');
  }

  // Only used for debugging.
  logDebug(): void {
    const str = this.serialize();
    // eslint-disable-next-line no-console
    console.log('🎆', str);
    if (str.length > 45_000) {
      // Manual testing shows 45k fits. 50k doesnt.
      // Max is 32k _tokens_, but tokens to bytes is wishywashy, so... hard to know for sure.
      console.warn('Output will likely not fit in the context window. Expect an AIDA error.');
    }
  }
}

export class AITreeFilter extends Trace.Extras.TraceFilter.TraceFilter {
  #minDuration: Trace.Types.Timing.Micro;
  #selectedEvent: Trace.Types.Events.Event;
  constructor(selectedEvent: Trace.Types.Events.Event) {
    super();
    // The larger the selected event is, the less small ones matter. We'll exclude items under ½% of the selected event's size
    this.#minDuration = Trace.Types.Timing.Micro((selectedEvent.dur ?? 1) * 0.005);
    this.#selectedEvent = selectedEvent;
  }
  accept(event: Trace.Types.Events.Event): boolean {
    if (event === this.#selectedEvent) {
      return true;
    }
    if (event.name === Trace.Types.Events.Name.COMPILE_CODE) {
      return false;
    }
    return event.dur ? event.dur >= this.#minDuration : false;
  }
}



class CallTreeNode {
  id: string;
  selected: boolean;
  dur: number;
  self: number;
  url?: string;
  children: CallTreeNode[] = [];
  snippet?: string;
  // Optimization metadata
  depth?: number;
  distanceToSelected?: number;
  pathToSelected?: boolean;
  calculatedValue?: number;
  calculatedWeight?: number

  constructor(public node: TimelineModel.TimelineProfileTree.Node) {
    this.id = node.id;
    this.selected = false;  // umm
    this.dur = node.totalTime;
    this.self = node.selfTime;
    this.url = node.event?.args?.data?.url;
    this.snippet = node.snippet ?? 'x';
    this.children = Array.from(node.children().values()).map(child => new CallTreeNode(child));
  }
}

class TreeOptimizer {
  private readonly TARGET_TOKENS = 32000;
  private readonly MIN_DURATION_MS = 0.2;

  // Base values for metadata fields
  private readonly BASE_VALUES =
      {identifier: 900, selected: 1000, dur: 200, self: 500, snippet: 700, url: 300, children: 400};

  // Approximate token weights
  private readonly WEIGHTS = {
    identifier: 7,
    selected: 4,
    dur: 5,
    self: 5,
    url: 5,
    snippet: 25,  // Minimum
    childrenPresent: 3,
    perChild: 7
  };
  root: CallTreeNode;
  selectedNodeId: string|symbol;
  totalTreeWeight: number;

  constructor(rootNode: TimelineModel.TimelineProfileTree.Node, selectedNode: TimelineModel.TimelineProfileTree.Node) {
    this.root = new CallTreeNode(rootNode);
    this.selectedNodeId = selectedNode.id
    return this;
  }

  public optimize(): CallTreeNode|null {
    // First pass: Annotate tree with depth and distance info
    this.annotateTree(this.root);

    // Second pass: Calculate values and weights
    this.calculateNodeMetrics(this.root);

    // Third pass: Select nodes and fields to include
    return this.buildOptimizedTree(this.root);
  }

  private annotateTree(node: CallTreeNode, depth: number = 0): boolean {
    node.depth = depth;

    // Find and mark path to selected node
    if (node.selected) {
      node.distanceToSelected = 0;
      node.pathToSelected = true;
      return true;
    }

    // Process children
    for (const child of node.children) {
      if (this.annotateTree(child, depth + 1)) {
        node.pathToSelected = true;
        node.distanceToSelected = child.distanceToSelected! + 1;
        return true;
      }
    }

    // Not on path to selected
    node.pathToSelected = false;
    node.distanceToSelected = Infinity;
    return false;
  }

  private calculateNodeMetrics(node: CallTreeNode): void {
    let value = 0;
    let weight = 0;

    // Calculate boost factor based on position
    let boost = this.calculateBoost(node);

    // Calculate base value and weight for each field
    if (node.id) {
      value += this.BASE_VALUES.identifier * boost;
      weight += this.WEIGHTS.identifier;
    }

    if (node.selected) {
      value += this.BASE_VALUES.selected * boost;
      weight += this.WEIGHTS.selected;
    }

    if (node.dur) {
      value += this.BASE_VALUES.dur * boost;
      weight += this.WEIGHTS.dur;
    }

    if (node.self) {
      value += this.BASE_VALUES.self * boost;
      weight += this.WEIGHTS.self;
    }

    // Add children metrics
    if (node.children.length > 0) {
      weight += this.WEIGHTS.childrenPresent;
      node.children.forEach(child => {
        this.calculateNodeMetrics(child);
        weight += this.WEIGHTS.perChild;
      });
    }

    node.calculatedValue = value;
    node.calculatedWeight = weight;
  }

  private calculateBoost(node: CallTreeNode): number {
    let boost = 1;

    // Base boosts
    if (node.selected)
      boost *= 10;  // 1000% boost
    if (node.depth === 0)
      boost *= 5;  // 500% boost for root
    if (node.depth === 1)
      boost *= 3;  // 300% boost for second level
    if (node.self > 0)
      boost *= 1.25;  // 125% boost for non-zero self time

    // Distance-based boost for nodes on path to selected
    if (node.pathToSelected) {
      // Exponential decay based on distance to selected
      const distanceBoost = Math.max(1, 2 ** (-node.distanceToSelected! / 3));
      boost *= distanceBoost;
    }

    return boost;
  }


  private calculateTreeStats(node: CallTreeNode): void {
    this.totalTreeWeight += node.calculatedWeight!;
    node.children.forEach(child => this.calculateTreeStats(child));
  }



  private buildOptimizedTree(node: CallTreeNode, tokenCount: number = 0): CallTreeNode {
    const compressionNeeded = this.totalTreeWeight > this.TARGET_TOKENS;
    const valueWeightThreshold = compressionNeeded ? this.calculateAdaptiveThreshold() : 0;

    console.log(
        node.node.event ? nameForEntry(node.node.event) : '??', node, 'worth', node.calculatedValue, 'weighs',
        node.calculatedWeight, 'sack', tokenCount);

    // Create base node - always include core fields
    const optimizedNode:
        CallTreeNode = {id: node.id, selected: node.selected, dur: node.dur, self: node.self, children: []};

    let currentTokens =
        tokenCount + this.WEIGHTS.identifier + this.WEIGHTS.selected + this.WEIGHTS.dur + this.WEIGHTS.self;

    // Add optional fields based on space availability and value
    if (!compressionNeeded || (node.url && node.calculatedValue! / node.calculatedWeight! > valueWeightThreshold)) {
      optimizedNode.url = node.url;
      currentTokens += this.WEIGHTS.url;
    }

    if (!compressionNeeded ||
        (node.snippet && node.calculatedValue! / node.calculatedWeight! > valueWeightThreshold * 1.5)) {
      optimizedNode.snippet = node.snippet;
      currentTokens += Math.max(this.WEIGHTS.snippet, node.snippet!.length / 4);
    }

    // Process children if we have space
    if (currentTokens < this.TARGET_TOKENS) {
      let remainingTokens = this.TARGET_TOKENS - currentTokens;

      // Sort children by value/weight ratio if we need to compress
      const children = [...node.children];
      if (compressionNeeded) {
        children.sort(
            (a, b) => (b.calculatedValue! / b.calculatedWeight!) - (a.calculatedValue! / a.calculatedWeight!));
      }

      // Process children
      for (const child of children) {
        if (remainingTokens <= 0)
          break;

        // Always include children on path to selected or if we have space
        if (!compressionNeeded || child.pathToSelected ||
            child.calculatedValue! / child.calculatedWeight! > valueWeightThreshold) {
          const optimizedChild = this.buildOptimizedTree(child, this.TARGET_TOKENS - remainingTokens);
          optimizedNode.children.push(optimizedChild);
          remainingTokens -= child.calculatedWeight!;
        }
      }
    }

    return optimizedNode;
  }

  private calculateAdaptiveThreshold(): number {
    // Calculate threshold based on total tree size and target tokens
    const compressionRatio = this.totalTreeWeight / this.TARGET_TOKENS;
    // Start with low threshold for small trees, increase for larger ones
    return Math.max(0, (compressionRatio - 1) * 50);
  }
}
