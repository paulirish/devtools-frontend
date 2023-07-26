// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as SDK from '../../../../../../front_end/core/sdk/sdk.js';
import * as TimelineModel from '../../../../../../front_end/models/timeline_model/timeline_model.js';
import type * as Platform from '../../../../../../front_end/core/platform/platform.js';
import * as Components from '../../../../../../front_end/ui/legacy/components/utils/utils.js';
import * as TraceEngine from '../../../../../../front_end/models/trace/trace.js';
import * as Timeline from '../../../../../../front_end/panels/timeline/timeline.js';
import {createTarget} from '../../../helpers/EnvironmentHelpers.js';
import {describeWithMockConnection} from '../../../helpers/MockConnection.js';
import * as Workspace from '../../../../../../front_end/models/workspace/workspace.js';
import * as Bindings from '../../../../../../front_end/models/bindings/bindings.js';
import {setupPageResourceLoaderForSourceMap} from '../../../helpers/SourceMapHelpers.js';
import type * as Protocol from '../../../../../../front_end/generated/protocol.js';
import {getAllTracingModelPayloadEvents} from '../../../helpers/TraceHelpers.js';
import * as Common from '../../../../../../front_end/core/common/common.js';
import {doubleRaf, renderElementIntoDOM} from '../../../helpers/DOMHelpers.js';
import { TraceLoader } from '../../../helpers/TraceLoader.js';
import { type TraceEventData } from '../../../../../../front_end/models/trace/types/TraceEvents.js';

import { type Tab } from '../../../../../../front_end/panels/timeline/TimelineDetailsView.js';
import { TimelineDetailsView } from '../../../../../../front_end/panels/timeline/TimelineDetailsView.js';

const {assert} = chai;

class MockViewDelegate implements Timeline.TimelinePanel.TimelineModeViewDelegate {
  select(_selection: Timeline.TimelineSelection.TimelineSelection|null): void {
  }
  selectEntryAtTime(_events: TraceEngine.Legacy.CompatibleTraceEvent[]|null, _time: number): void {
  }
  highlightEvent(_event: TraceEngine.Legacy.CompatibleTraceEvent|null): void {
  }
}

describeWithMockConnection('timeline-aggregated-details', function() {
  let tracingModel: TraceEngine.Legacy.TracingModel;
  let process: TraceEngine.Legacy.Process;
  let thread: TraceEngine.Legacy.Thread;
  let target: SDK.Target.Target;
  const SCRIPT_ID = 'SCRIPT_ID' as Protocol.Runtime.ScriptId;
  const mockViewDelegate = new MockViewDelegate();

  beforeEach(() => {
    target = createTarget();
    tracingModel = new TraceEngine.Legacy.TracingModel();
    process = new TraceEngine.Legacy.Process(tracingModel, 1);
    thread = new TraceEngine.Legacy.Thread(process, 1);

    const workspace = Workspace.Workspace.WorkspaceImpl.instance();
    const targetManager = SDK.TargetManager.TargetManager.instance();
    const resourceMapping = new Bindings.ResourceMapping.ResourceMapping(targetManager, workspace);
    const debuggerWorkspaceBinding = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance({
      forceNew: true,
      resourceMapping,
      targetManager,
    });
    Bindings.IgnoreListManager.IgnoreListManager.instance({forceNew: true, debuggerWorkspaceBinding});
  });



  it('renders the correct title for an EventTiming interaction event', async function() {
    debugger;
    const {metadata, traceParsedData} = TraceLoader.allModels(this, getTraceData());

    const detailsView = new Timeline.TimelineDetailsView.TimelineDetailsView(mockViewDelegate);

    const groupByEnum = Timeline.TimelineTreeView.AggregatedTimelineTreeView.GroupBy;
    for (const grouping of Object.values(groupByEnum)) {
      testEventTree(Timeline.TimelineDetailsView.Tab.CallTree, grouping);
      testEventTree(Timeline.TimelineDetailsView.Tab.BottomUp, grouping);
    }
    testEventTree(Timeline.TimelineDetailsView.Tab.BottomUp);

    function testEventTree(type: Timeline.TimelineDetailsView.Tab, grouping?: Timeline.TimelineTreeView.AggregatedTimelineTreeView.GroupBy) {

      const tree = detailsView.rangeDetailViews.get(type) as Timeline.TimelineTreeView.AggregatedTimelineTreeView;
      if (!tree) {
        throw new Error('tree not found');
      }

      console.log(type + '  Group by: ' + grouping);
      tree.groupBySetting.set(grouping);

      const rootNode = tree.dataGrid.rootNode();
      for (const node of rootNode.children)
        {printEventTree(1, node.profileNode, node.treeView);}
    }

    function printEventTree(padding: number, node:Timeline.TimelineTreeView.GridNode, treeView: Timeline.TimelineTreeView.AggregatedTimelineTreeView) {
      let name;
      if (node.isGroupNode()) {
        name = treeView.displayInfoForGroupNode(node).name;
      } else {
        name = node.event.name === TimelineModel.TimelineModel.RecordType.JSFrame ?
            UI.beautifyFunctionName(node.event.args['data']['functionName']) :
            Timeline.TimelineUIUtils.eventTitle(node.event);
      }
      console.log('  '.repeat(padding) + `${name}: ${node.selfTime.toFixed(3)}  ${node.totalTime.toFixed(3)}`);
      node.children().forEach(printEventTree.bind(null, padding + 1));
    }
  });
});

function getTraceData() {
  const sessionId = '6.23';
  const rawTraceEvents = [
    {
      'args': {'name': 'Renderer'},
      'cat': 'metadata',
      'name': 'process_name',
      'ph': 'M',
      'pid': 17851,
      'tid': 23,
      'ts': 0,
    },
    {
      'args': {'name': 'CrRendererMain'},
      'cat': 'metadata',
      'name': 'thread_name',
      'ph': 'M',
      'pid': 17851,
      'tid': 23,
      'ts': 0,
    },
    {
      'args': {
        'data': {
          'page': '0x2f7b63884000',
          'sessionId': sessionId,
          'persistentIds': true,
          'frames': [
            {'frame': '0x2f7b63884000', 'url': 'top-page-url', 'name': 'top-page-name'},
            {'frame': '0x2f7b63884100', 'url': 'subframe-url1', 'name': 'subframe-name1', 'parent': '0x2f7b63884000'},
            {'frame': '0x2f7b63884200', 'url': 'about:blank', 'name': 'subframe-name2', 'parent': '0x2f7b63884000'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'TracingStartedInPage',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 100000,
      'tts': 606543,
    },
    {
      'args': {'data': {'frame': '0x2f7b63884300', 'url': 'subframe-url3', 'name': 'subframe-name3', 'parent': '0x2f7b63884000'}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'CommitLoad',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 100010,
      'tts': 606544,
    },
    {
      'args': {},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'Program',
      'ph': 'B',
      'pid': 17851,
      'tid': 23,
      'ts': 200000,
      'tts': 5612442,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'c', 'callUID': 'c', 'scriptId': 1}, {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 208000,
      'tts': 1758056,
    },
    {
      'args': {'data': {'frame': '0x2f7b63884100'}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'FunctionCall',
      'ph': 'X',
      'pid': 17851,
      'tid': 23,
      'ts': 210000,
      'dur': 30000,
      'tts': 5612442,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'c', 'callUID': 'c', 'scriptId': 1}, {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 211000,
      'tts': 1758056,
    },
    {
      'args': {'data': {'stackTrace': []}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 212000,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'c', 'callUID': 'c', 'scriptId': 1}, {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 219875,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'frame': '0x2f7b63884000',
          'stackTrace': [
            {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'InvalidateLayout',
      'ph': 'X',
      'pid': 17851,
      'tid': 23,
      'ts': 220000,
      'dur': 7000,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'c', 'callUID': 'c', 'scriptId': 1}, {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 220125,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'frame': '0x2f7b63884000',
          'stackTrace': [
            {'functionName': 'b', 'callUID': 'b', 'scriptId': 1},
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'InvalidateLayout',
      'ph': 'X',
      'pid': 17851,
      'tid': 23,
      'ts': 221000,
      'dur': 3000,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'g', 'scriptId': 1}, {'functionName': 'f', 'scriptId': 1},
            {'functionName': 'b', 'scriptId': 1}, {'functionName': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 222000,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'g', 'scriptId': 1}, {'functionName': 'e', 'scriptId': 1},
            {'functionName': 'b', 'scriptId': 1}, {'functionName': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 227125,
      'tts': 1758056,
    },
    {
      'name': 'TimeStamp',
      'ts': 227130,
      'ph': 'I',
      'tid': 23,
      'pid': 17851,
      'cat': 'disabled-by-default-devtools.timeline',
      'args': {'data': {'message': 'foo05'}},
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'g', 'scriptId': 1}, {'functionName': 'e', 'scriptId': 1},
            {'functionName': 'b', 'scriptId': 1}, {'functionName': 'a', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 227250,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1}, {'functionName': 'l', 'callUID': 'l', 'scriptId': 1},
            {'functionName': 'f', 'callUID': 'f', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 230000,
      'tts': 1758056,
    },
    {
      'args': {
        'beginData': {
          'frame': '0x2f7b63884200',
          'stackTrace': [
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1}, {'functionName': 'l', 'callUID': 'l', 'scriptId': 1},
            {'functionName': 'f', 'callUID': 'f', 'scriptId': 1},
            {'functionName': 'sin', 'callUID': 'sin', 'scriptId': 2, 'url': 'native math.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'Layout',
      'ph': 'X',
      'dur': 100,
      'pid': 17851,
      'tid': 23,
      'ts': 230010,
      'tts': 1758056,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1}, {'functionName': 'l', 'callUID': 'l', 'scriptId': 1},
            {'functionName': 'f', 'callUID': 'f', 'scriptId': 1},
            {'functionName': 'sin', 'callUID': 'sin', 'scriptId': 2, 'url': 'native math.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'TimerInstall',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 230111,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'a', 'callUID': 'a', 'scriptId': 1}, {'functionName': 'l', 'callUID': 'l', 'scriptId': 1},
            {'functionName': 'f', 'callUID': 'f', 'scriptId': 1},
            {'functionName': 'sin', 'callUID': 'sin', 'scriptId': 2, 'url': 'native math.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 230125,
    },
    {
      'args': {'data': {'frame': '0x2f7b63884300'}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'FunctionCall',
      'ph': 'X',
      'pid': 17851,
      'tid': 23,
      'ts': 250000,
      'dur': 10000,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'FunctionCall',
      'ph': 'X',
      'pid': 17851,
      'tid': 23,
      'ts': 251000,
      'dur': 1000,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'w', 'callUID': 'w', 'scriptId': 1}, {'functionName': 'z', 'callUID': 'z', 'scriptId': 1},
            {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 251000,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'w', 'callUID': 'w', 'scriptId': 1}, {'functionName': 'z', 'callUID': 'z', 'scriptId': 1},
            {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 251100,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'w', 'scriptId': 1}, {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 251200,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'w', 'scriptId': 1}, {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 251300,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'y', 'callUID': 'y', 'scriptId': 1},
            {'functionName': 'x', 'callUID': 'x', 'scriptId': 1},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 251400,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'recursive_b', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_b', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253000,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_b', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253008,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'recursive_b', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253012,
    },
    {
      'args': {
        'data':
            {'stackTrace': [{'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'}]},
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253014,
    },
    {
      'args': {'data': {'stackTrace': []}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253015,
    },
    {
      'args': {
        'data': {
          'stackTrace': [
            {'functionName': 'recursive_b', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
            {'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'},
          ],
        },
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253100,
    },
    {
      'args': {
        'data':
            {'stackTrace': [{'functionName': 'recursive_a', 'scriptId': 1, 'url': 'http://www.google.com/rec.js'}]},
      },
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253200,
    },
    {
      'args': {'data': {'stackTrace': []}},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'JSSample',
      'ph': 'I',
      'pid': 17851,
      'tid': 23,
      'ts': 253300,
    },
    {
      'args': {},
      'cat': 'disabled-by-default-devtools.timeline',
      'name': 'Program',
      'ph': 'E',
      'pid': 17851,
      'tid': 23,
      'ts': 500000,
      'tts': 5612506,
    },
  ] as TraceEventData[];
  return rawTraceEvents;
}
