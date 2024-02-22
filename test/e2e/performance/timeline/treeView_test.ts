// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import type * as puppeteer from 'puppeteer-core';

import {
  $,
  $$,
  click,
  getBrowserAndPages,
  step,
  waitFor,
  waitForAria,
  waitForElementWithTextContent,
  waitForFunction,
} from '../../../shared/helper.js';
import {describe, it} from '../../../shared/mocha-extensions.js';
import {
  navigateToBottomUpTab,
  navigateToPerformanceTab,
  setFilter,
  toggleCaseSensitive,
  toggleMatchWholeWordButtonBottomUp,
  toggleRegExButtonBottomUp,
} from '../../helpers/performance-helpers.js';

async function checkActivityTree(
    frontend: puppeteer.Page,  expandSubTree: boolean = false) {

  let parentItem: puppeteer.ElementHandle<Element>|undefined = undefined;
  const result: string[] = [];
  let itemFound = false;
  do {
    itemFound = await waitForFunction(async () => {
      if (parentItem) {
        parentItem.evaluate(e => e.scrollIntoView());
      }
      const treeItem = await $<HTMLElement>('.data-grid-data-grid-node.selected.revealed .activity-name');
      if (!treeItem) {
        return false;
      }
      const treeItemText = await treeItem.evaluate(el => el.innerText);
      if (treeItemText) {
        result.push(treeItemText);
        parentItem = treeItem;
        return true;
      }
      return false;
    });


    if (expandSubTree) {
      await frontend.keyboard.press('ArrowRight');
    }

    await frontend.keyboard.press('ArrowDown');
  } while (itemFound);

  return result;
}

async function getTreeParentActivities() {
  return await waitForFunction(async () => {
    const result = [];
    const treeItems = await $$<HTMLElement>('.data-grid-data-grid-node.parent.revealed .activity-name');
    for (let i = 0; i < treeItems.length; i++) {
      const treeItem = treeItems[i];
      const treeItemText = await treeItem.evaluate(el => el.innerText);
      result.push(treeItemText);
    }

    return result;
  });
}

const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

describe('The Performance tool, Bottom-up panel', function() {
  // These tests have lots of waiting which might take more time to execute
  if (this.timeout() !== 0) {
    this.timeout(20000);
  }


  describe('Recording', function() {
    it('triggers warmup', async () => {
      await navigateToPerformanceTab('empty');

      const recordButton = await waitForAria('Record');
      assert.isNotNull(recordButton, 'no record button found');


      // const {frontend, browser} = getBrowserAndPages();
      // const result = await frontend.evaluate(`(async () => {
      //   const puppeteer = await import('./third_party/puppeteer/puppeteer.js');
      //   const SDK = await import('./core/sdk/sdk.js');
      //   const mainTarget = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
      //       if (!mainTarget) {
      //         throw new Error('Could not find main target');
      //       }

      await recordButton.click();
      await wait(1_000);

      const stopButton = await waitFor<HTMLButtonElement>('.stop-button .primary-button');
      await stopButton.click();
      await navigateToBottomUpTab();

      const {frontend} = getBrowserAndPages();
      const expectedActivities = ['h2', 'H2', 'h2_with_suffix'];
      await checkActivityTree(frontend, false);


      await wait(20_000);
    });
  });



  describe.only('Bottom-up panel', function() {
    beforeEach(async () => {
      await step('navigate to the Performance tab and upload performance profile', async () => {
        await navigateToPerformanceTab('empty');

        const uploadProfileHandle = await waitFor<HTMLInputElement>('input[type=file]');
        assert.isNotNull(uploadProfileHandle, 'unable to upload the performance profile');
        await uploadProfileHandle.uploadFile('test/e2e/resources/performance/timeline/treeView-test-trace.json');
      });
    });

    it('match case button is working as expected', async () => {
      const expectedActivities = ['h2', 'H2', 'h2_with_suffix'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('click on the "Match Case" button and validate activities', async () => {
        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await toggleCaseSensitive();
        await setFilter('H2');
        const x  = (await getTreeParentActivities());
        console.log({x});

        assert.deepStrictEqual((await getTreeParentActivities()), ['H2'], 'Tree does not contain expected activities');
        debugger;
      });
    });

    it('regex button is working as expected', async () => {
      const expectedActivities = ['h2', 'H2', 'h2_with_suffix'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('click on the "Regex Button" and validate activities', async () => {
        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await toggleRegExButtonBottomUp();
        await setFilter('h2$');
        assert.deepStrictEqual((await getTreeParentActivities()), [ 'H2', 'h2'], 'Tree does not contain expected activities');
      });
    });

    it('match whole word is working as expected', async () => {
      const expectedActivities = ['h2', 'H2'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('click on the "Match whole word" and validate activities', async () => {
        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await toggleMatchWholeWordButtonBottomUp();
        await setFilter('function');
        assert.deepStrictEqual(
            (await getTreeParentActivities()), ['Function Call'], 'Tree does not contain expected activities');
      });
    });

    it('simple filter is working as expected', async () => {
      const expectedActivities = ['h2', 'H2', 'h2_with_suffix'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('validate activities', async () => {
        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await setFilter('h2');
        assert.deepStrictEqual(
            (await getTreeParentActivities()), expectedActivities, 'Tree does not contain expected activities');
      });
    });

    it.only('filtered results keep context', async () => {
      const {frontend} = getBrowserAndPages();
      const expectedActivities = ['h2_with_suffix', 'container2', 'Function Call', 'Timer Fired'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('validate that top level activities have the right context', async () => {
        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        await toggleRegExButtonBottomUp();
        await toggleCaseSensitive();
        await setFilter('h2_');
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await rootActivity.click();
        assert.deepStrictEqual(
           ( await checkActivityTree(frontend, true)), expectedActivities, 'Tree does not contain expected activities');
      });
    });

    it('sorting "Title" column is working as expected', async () => {
      const {frontend} = getBrowserAndPages();
      const expectedActivities = ['Commit', 'Function Call', 'h2_with_suffix', 'h2', 'H2', 'Layerize', 'Layout'];

      await step('navigate to the Bottom Up tab', async () => {
        await navigateToBottomUpTab();
      });

      await step('validate activities', async () => {
        await waitFor('th.activity-column');
        await click('th.activity-column');
        await waitFor('th.activity-column.sortable.sort-ascending');

        const timelineTree = await $('.timeline-tree-view') as puppeteer.ElementHandle<HTMLSelectElement>;
        const rootActivity = await waitForElementWithTextContent(expectedActivities[0], timelineTree);
        if (!rootActivity) {
          assert.fail(`Could not find ${expectedActivities[0]} in frontend.`);
        }
        await rootActivity.click();

        assert.deepStrictEqual(
            (await checkActivityTree(frontend)), expectedActivities,
            'Tree does not contain activities in the expected order');
      });
    });
  });
});
