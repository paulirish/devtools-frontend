// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import {describe, it} from 'mocha';

import {getInsightOrError} from '../../../testing/InsightHelpers.js';
import {setupLocaleHooks} from '../../../testing/LocaleHelpers.js';
import {TraceLoader} from '../../../testing/TraceLoader.js';

describe('ForcedReflow', function() {
  setupLocaleHooks();
  async function processTrace(context: Mocha.Suite|Mocha.Context, traceFile: string) {
    const {data, insights} = await TraceLoader.traceEngine(context, traceFile);
    if (!insights) {
      throw new Error('No insights');
    }

    return {data, insights};
  }

  it('generates call stacks', async function() {
    if (this.timeout() > 0) {
      this.timeout(45_000);
    }
    const {data, insights} = await processTrace(this, 'forced-reflow.json.gz');
    assert.strictEqual(insights.size, 1);
    const insight =
        getInsightOrError('ForcedReflow', insights, data.Meta.navigationsByNavigationId.values().next().value);

    assert.isUndefined(insight.topLevelFunctionCallData);
    assert.lengthOf(insight.aggregatedBottomUpData, 1);

    const callStack = insight.aggregatedBottomUpData[0];
    assert.strictEqual(callStack.bottomUpData?.functionName, 'sidemenuitemintoview');
    assert.strictEqual(callStack.bottomUpData?.lineNumber, 383);
    assert.strictEqual(callStack.bottomUpData?.columnNumber, 11);
    assert.strictEqual(callStack.totalTime, 56165);
    assert.lengthOf(callStack.relatedEvents, 2);
  });

  it('identifies top-level function call data', async function() {
    const {insights} = await processTrace(this, 'large-layout-small-recalc.json.gz');
    const insight = getInsightOrError('ForcedReflow', insights);

    assert.strictEqual(insight.topLevelFunctionCallData?.topLevelFunctionCall.lineNumber, 20);
    assert.strictEqual(insight.topLevelFunctionCallData?.topLevelFunctionCall.columnNumber, 60);
    assert.strictEqual(insight.topLevelFunctionCallData?.totalReflowTime, 130806);

    assert.lengthOf(insight.aggregatedBottomUpData, 1);
    const callStack = insight.aggregatedBottomUpData[0];
    assert.strictEqual(callStack.bottomUpData?.lineNumber, 22);
    assert.strictEqual(callStack.bottomUpData?.columnNumber, 24);
    assert.lengthOf(callStack.relatedEvents, 2);
  });
});
