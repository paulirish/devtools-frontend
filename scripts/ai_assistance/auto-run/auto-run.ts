// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
// We don't have types for `js-yaml` in the codebase.
// @ts-expect-error
import * as yaml from 'js-yaml';
import * as path from 'path';
import type {Browser, ElementHandle, Page} from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs/yargs';

import type {
  ExampleMetadata, ExecutedExample, IndividualPromptRequestResponse, Logs, PatchTest, RunResult} from '../types';

import {parseComment, parseFollowUps} from './auto-run-helpers.ts';
import {TraceDownloader} from './trace-downloader.ts';

// Define types for browser-scope functions/variables if not globally available
declare global {
  interface Window {
    aiAssistanceTestPatchPrompt?(folderName: string, query: string, changedFiles: Array<{
                                   path: string,
                                   matches: string[],
                                   doesNotMatch?: string[],
                                 }>): Promise<{assertionFailures: string[], debugInfo: string, error?: string}>;
    setDebugAiAssistanceEnabled?(enabled: boolean): void;
    // Define the structure expected for __commentElements if possible
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __commentElements?: Array<{comment: string, commentElement: Comment, targetElement: Element|null}>;
  }
  // Define the custom event if needed
  interface WindowEventMap {
    aiassistancedone: CustomEvent;
  }
}

const DEFAULT_FOLLOW_UP_QUERY = 'Fix the issue using JavaScript code execution.';

const startTime = performance.now();
const numberFormatter = new Intl.NumberFormat('en-EN', {
  maximumSignificantDigits: 3,
});
const acquiredDevToolsTargets = new WeakMap();
function formatElapsedTime() {
  return `${numberFormatter.format((performance.now() - startTime) / 1000)}s`;
}

const userArgs =
    yargs(hideBin(process.argv))
        .option('example-urls', {
          string: true,
          type: 'array',
          demandOption: true,
        })
        .option('parallel', {
          boolean: true,
          default: true,
        })
        .option('times', {
          describe: 'How many times do you want to run an example?',
          number: true,
          default: 1,
        })
        .option('label', {string: true, default: 'run'})
        .option('include-follow-up', {
          boolean: true,
          default: false,
        })
        .option('test-target', {
          describe: 'Which panel do you want to run the examples against?',
          choices: ['elements', 'performance-main-thread', 'performance-insights', 'elements-multimodal', 'patching'],
          demandOption: true,
        })
        .parseSync();

const exampleUrls: string[] = [];
const OUTPUT_DIR = path.resolve(import.meta.dirname, 'data');

for (const exampleUrl of userArgs.exampleUrls) {
  for (let i = 0; i < userArgs.times; i++) {
    const url = new URL(exampleUrl);
    if (i !== 0) {
      url.searchParams.set('iteration', `${i + 1}`);
    }
    exampleUrls.push(url.toString());
  }
}

class Logger {
  #logs: Logs = {};
  #updateElapsedTimeInterval: NodeJS.Timeout|null = null;

  constructor() {
    this.#updateElapsedTimeInterval = setInterval(() => {
      this.#updateElapsedTime();
    }, 1000);
  }

  #updateElapsedTime() {
    this.#logs['elapsedTime'] = {
      index: 999,
      text: `\nElapsed time: ${formatElapsedTime()}`,
    };
    this.#flushLogs();
  }

  #flushLogs() {
    process.stdout.write('\x1Bc');
    const values = Object.values(this.#logs);
    const sortedValues = values.sort((val1, val2) => val1.index - val2.index);
    for (const {text} of sortedValues) {
      process.stdout.write(`${text}\n`);
    }
  }

  formatError(err: Error): string {
    const stack = typeof err.cause === 'object' && err.cause && 'stack' in err.cause ? err.cause.stack : '';
    return `${err.stack}${err.cause ? `\n${stack}` : ''}`;
  }

  /**
   * Logs a header message to the console.
   * @param {string} text The header text to log.
   */
  head(text: string) {
    this.log('head', -1, `${text}\n`);
  }

  /**
   * @param {string} id
   * @param {number} index
   * @param {string} text
   */
  log(id: string, index: number, text: string) {
    this.#updateElapsedTime();
    this.#logs[id] = {index, text};
    this.#flushLogs();
  }

  destroy() {
    if (this.#updateElapsedTimeInterval) {
      clearInterval(this.#updateElapsedTimeInterval);
    }
  }
}

export class Example {
  #url: string;
  #browser: Browser;
  #ready = false;
  #page: Page|null = null;
  #devtoolsPage: Page|null = null;
  #queries: string[] = [];
  #explanation = '';
  #test: PatchTest|null = null;
  /**
   * @param {string} url
   * @param {puppeteer.Browser} browser
   */
  constructor(url: string, browser: Browser) {
    this.#url = url;
    this.#browser = browser;
  }

  /**
   * @param {puppeteer.Page} devtoolsPage
   * @param {string} fileName - the trace file to import.
   */
  async #loadPerformanceTrace(devtoolsPage: Page, fileName: string) {
    await devtoolsPage.keyboard.press('Escape');
    await devtoolsPage.keyboard.press('Escape');
    await devtoolsPage.locator(':scope >>> #tab-timeline').setTimeout(5000).click();
    this.log('[Info]: loaded performance panel');
    const fileUploader = await devtoolsPage.locator('input[type=file]').waitHandle();
    const tracePath = path.join(TraceDownloader.location, fileName);
    await fileUploader.uploadFile(tracePath);
    this.log(`[Info]: imported ${fileName} to performance panel`);
    const canvas = await devtoolsPage.waitForSelector(
        ':scope >>> canvas.flame-chart-canvas',
    );
    if (!canvas) {
      throw new Error('Could not find canvas.');
    }
    await this.#waitForElementToHaveHeight(canvas, 200);
  }

  async #waitForElementToHaveHeight(elem: ElementHandle<HTMLElement>, height: number, tries = 0): Promise<boolean> {
    const h = await elem.evaluate(e => e.clientHeight);
    if (h > height) {
      return true;
    }
    if (tries > 10) {
      return false;
    }
    return await new Promise(r => {
      setTimeout(() => r(this.#waitForElementToHaveHeight(elem, height)), 100);
    });
  }

  async #getCommentStringsFromPage(page: Page): Promise<string[]> {
    const commentStringsFromPage = await page.evaluate(() => {
      function collectComments(root: Node|ShadowRoot):
          Array<{comment: string, commentElement: Comment, targetElement: Element | null}> {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
        const results = [];
        while (walker.nextNode()) {
          const comment = walker.currentNode;
          if (!(comment instanceof Comment)) {
            continue;
          }

          results.push({
            comment: comment.textContent?.trim() ?? '',
            commentElement: comment,
            targetElement: comment.nextElementSibling,
          });
        }
        return results;
      }
      const elementWalker = document.createTreeWalker(
          document.documentElement,
          NodeFilter.SHOW_ELEMENT,
      );
      const results = [...collectComments(document.documentElement)];
      while (elementWalker.nextNode()) {
        const el = elementWalker.currentNode;
        if (el instanceof Element && 'shadowRoot' in el && el.shadowRoot) {
          results.push(...collectComments(el.shadowRoot));
        }
      }
      // @ts-expect-error
      globalThis.__commentElements = results;
      return results.map(result => result.comment);
    });
    return commentStringsFromPage;
  }

  async #lookForAnnotatedPerformanceEvent(devtoolsPage: Page): Promise<ElementHandle<HTMLElement>> {
    const elem = await devtoolsPage.$(
        'devtools-entry-label-overlay >>> [aria-label="Entry label"]',
    );
    if (!elem) {
      throw new Error(
          'Could not find annotated event in the performance panel. Only traces that have one entry label annotation are supported.',
      );
    }

    return elem as ElementHandle<HTMLElement>;
  }

  /**
   * Generates the metadata for a given example.
   * If we are testing performance, we look for an annotation to give us our target event that we need to select.
   * We then also parse the HTML to find the comments which give us our prompt
   * and explanation.
   */
  async #generateMetadata(page: Page, devtoolsPage: Page): Promise<{
    idx: number,
    queries: string[],
    explanation: string,
    performanceAnnotation?: ElementHandle<HTMLElement>, rawComment: Record<string, string>,
  }> {
    let annotation: ElementHandle<HTMLElement>|undefined = undefined;
    if (userArgs.testTarget === 'performance-main-thread') {
      annotation = await this.#lookForAnnotatedPerformanceEvent(devtoolsPage);
    }

    const commentStringsFromPage = await this.#getCommentStringsFromPage(page);
    const comments = commentStringsFromPage.map(
        comment => parseComment(comment),
    );
    // Only get the first comment for now.
    const comment = comments[0];
    const queries = [comment.prompt];

    const followUpPromptsFromExample = parseFollowUps(comment);

    if (userArgs.includeFollowUp && followUpPromptsFromExample.length === 0) {
      queries.push(DEFAULT_FOLLOW_UP_QUERY);
    } else {
      queries.push(...followUpPromptsFromExample);
    }

    return {
      idx: 0,
      queries,
      explanation: comment.explanation,
      performanceAnnotation: annotation,
      rawComment: comment,
    };
  }

  url(): string {
    return this.#url;
  }

  id(): string {
    return this.#url.split('/').pop()?.replace('.html', '') ?? 'unknown-id';
  }

  isReady() {
    return this.#ready;
  }

  async #prepare() {
    this.log('Creating a page');
    const page = await this.#browser.newPage();
    this.#page = page;
    await page.goto(this.#url);
    this.log(`Navigated to ${this.#url}`);

    const devtoolsTarget = await this.#browser.waitForTarget(target => {
      const isAcquiredBefore = acquiredDevToolsTargets.has(target);
      return (target.type() === 'other' && target.url().startsWith('devtools://') && !isAcquiredBefore);
    });
    acquiredDevToolsTargets.set(devtoolsTarget, true);

    const devtoolsPage = await devtoolsTarget.asPage();
    this.#devtoolsPage = devtoolsPage;
    this.log('[Info]: Got devtools page');

    if (userArgs.testTarget === 'patching') {
      const text = await page.evaluate(() => {
        return document.querySelector('code')?.innerText;
      });
      this.#test = yaml.load(text);
      // Workspaces are slow to appear.
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      if (userArgs.testTarget === 'performance-main-thread' || userArgs.testTarget === 'performance-insights') {
        const fileName = await TraceDownloader.download(this, page);
        await this.#loadPerformanceTrace(devtoolsPage, fileName);
      }

      const {idx, queries, explanation, performanceAnnotation, rawComment} =
          await this.#generateMetadata(page, devtoolsPage);
      this.log('[Info]: Running...');
      // Strip comments to prevent LLM from seeing it.
      await page.evaluate(() => {
        // @ts-expect-error we don't type globalThis.__commentElements
        for (const {commentElement} of globalThis.__commentElements ?? []) {
          commentElement.remove();
        }
      });

      await devtoolsPage.keyboard.press('Escape');
      await devtoolsPage.keyboard.press('Escape');

      if (userArgs.testTarget === 'elements' || userArgs.testTarget === 'elements-multimodal') {
        await devtoolsPage.locator(':scope >>> #tab-elements').setTimeout(5000).click();
        this.log('[Info]: Opened Elements panel');

        await devtoolsPage.locator('aria/<body>').click();

        this.log('[Info]: Expanding all elements');
        let expand = await devtoolsPage.$$('pierce/.expand-button');
        while (expand.length) {
          for (const btn of expand) {
            await btn.click();
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          expand = await devtoolsPage.$$('pierce/.expand-button');
        }

        // If we are inspecting a DOM node, we inspect it via the console by using the global `inspect` method.
        this.log('[Info]: Locating console');
        await devtoolsPage.locator(':scope >>> #tab-console').click();
        await devtoolsPage.locator('aria/Console prompt').click();
        await devtoolsPage.keyboard.type(
            `inspect(globalThis.__commentElements[${idx}].targetElement)`,
        );
        await devtoolsPage.keyboard.press('Enter');

        // Once we are done with the console, go back to the elements tab.
        await devtoolsPage.locator(':scope >>> #tab-elements').click();
      }

      if (userArgs.testTarget === 'performance-main-thread' && performanceAnnotation) {
        this.log('[Info]: selecting event in the performance timeline');
        await devtoolsPage.locator(':scope >>> #tab-timeline').setTimeout(5000).click();
        // Clicking on the annotation will also have the side-effect of selecting the event
        await performanceAnnotation.click();
        // Wait until the event is selected (confirming via the HTML in the details drawer)
        await devtoolsPage.waitForSelector(
            ':scope >>> .timeline-details-chip-title',
        );
      }

      if (userArgs.testTarget === 'performance-insights') {
        const insightTitle = rawComment.insight;
        if (!insightTitle) {
          throw new Error(
              'Cannot execute performance-insights example without "Insight:" in example comment metadata.');
        }

        this.log('[Info]: selecting insight in the performance panel');
        await devtoolsPage.locator(':scope >>> #tab-timeline').setTimeout(5000).click();

        // Ensure the sidebar is open. If this selector is not found then we assume the sidebar is already open.
        const sidebarButton = await devtoolsPage.$('aria/Show sidebar');
        if (sidebarButton) {
          await sidebarButton.click();
        }

        this.log(`[Info]: expanding Insight ${insightTitle}`);
        // Now find the header for the right insight, and click to expand it.
        // Note that we can't use aria here because the aria-label for insights
        // can be extended to include estimated savings. So we use the data
        // attribute instead. The title is JSON so it is already wrapped with double quotes.
        await devtoolsPage.locator(`:scope >>> [data-insight-header-title=${insightTitle}]`).setTimeout(10_000).click();
      }

      this.log('[Info]: Locating AI assistance tab');
      // Because there are two Performance AI flows, to ensure we activate the
      // right one for Insights, we go via the "Ask AI" button in the Insights
      // sidebar directly to select the right insight.
      // For the other flows, we select the right context item in the right
      // panel, and then open the AI Assistance panel.
      if (userArgs.testTarget === 'performance-insights') {
        // Now click the "Ask AI" button to open up the AI assistance panel
        await devtoolsPage.locator(':scope >>> devtools-button[data-insights-ask-ai]').setTimeout(5000).click();
        this.log('[Info]: Opened AI assistance tab');
      } else {
        await devtoolsPage.locator('aria/Customize and control DevTools').click();
        await devtoolsPage.locator('aria/More tools').click();
        await devtoolsPage.locator('aria/AI assistance').click();
      }

      this.log('[Info]: Opened AI assistance tab');

      this.#queries = queries;
      this.#explanation = explanation;
    }
  }

  async prepare() {
    this.log('Getting prepared');
    try {
      await this.#prepare();
      this.#ready = true;
    } catch (err) {
      this.#ready = false;
      this.error(
          `Preparation failed.\n${err instanceof Error ? logger.formatError(err) : err}`,
      );
    }
  }

  /**
   * Returns the locator string based on the user-provided test target.
   * @returns {string} The locator string.
   */
  #getLocator(): string {
    switch (userArgs.testTarget) {
      case 'elements':
      case 'elements-multimodal':
        return 'aria/Ask a question about the selected element';
      case 'performance-main-thread':
        return 'aria/Ask a question about the selected item and its call tree';
      case 'performance-insights':
        return 'aria/Ask a question about the selected performance insight';
      case 'patching':
      default:
        throw new Error('Not supported');
    }
  }

  async execute(): Promise<ExecutedExample> {
    if (!this.#devtoolsPage) {
      throw new Error('Cannot execute without DevTools page.');
    }
    if (!this.#page) {
      throw new Error('Cannot execute without target page');
    }
    const executionStartTime = performance.now();

    try {
      if (userArgs.testTarget === 'patching') {
        if (!this.#test) {
          throw new Error('Cannot execute without a test');
        }
        await this.#devtoolsPage.waitForFunction(() => {
          return 'aiAssistanceTestPatchPrompt' in window;
        });
        const {assertionFailures, debugInfo, error} =
            await this.#devtoolsPage.evaluate(async (folderName, query, changedFiles) => {
              // @ts-expect-error this is run in the DevTools page context where this function does exist.
              return await aiAssistanceTestPatchPrompt(folderName, query, changedFiles);
            }, this.#test.folderName, this.#test.query, this.#test.changedFiles);
        return {
          results: [{
            // Estimate a score based on the number of assertion
            // failures and if the flow succeeded.
            score: error ? 0.25 : Math.max((1 - (assertionFailures.length * 0.25)), 0.25),
            request: this.#test.query,
            response: debugInfo,
            exampleId: this.id(),
            error,
            assertionFailures,
          }],
          metadata: {exampleId: this.id(), explanation: JSON.stringify(this.#test.changedFiles)},
        };
      }
      await this.#devtoolsPage.waitForFunction(() => {
        return 'setDebugAiAssistanceEnabled' in window;
      });

      await this.#devtoolsPage.evaluate(() => {
        // @ts-expect-error this is run in the DevTools page context where this function does exist.
        setDebugAiAssistanceEnabled(true);
      });

      const results: IndividualPromptRequestResponse[] = [];

      const prompt = async(query: string): Promise<IndividualPromptRequestResponse[]> => {
        if (!this.#devtoolsPage) {
          throw new Error('Cannot prompt without DevTools page.');
        }
        const devtoolsPage = this.#devtoolsPage;

        if (userArgs.testTarget === 'elements-multimodal') {
          await devtoolsPage.locator('aria/Take screenshot').click();
        }

        const inputSelector = this.#getLocator();
        await devtoolsPage.locator(inputSelector).click();
        await devtoolsPage.locator(inputSelector).fill(query);

        const abort = new AbortController();
        /**
         * @param {AbortSignal} signal AbortSignal to stop the operation.
         */
        const autoAcceptEvals = async (signal: AbortSignal) => {
          while (!signal.aborted) {
            await devtoolsPage.locator('aria/Continue').click({signal});
          }
        };

        autoAcceptEvals(abort.signal).catch(err => {
          if (err.message === 'This operation was aborted') {
            return;
          }
          console.error('autoAcceptEvals', err);
        });

        const done = this.#devtoolsPage.evaluate(() => {
          return new Promise<void>(resolve => {
            window.addEventListener(
                'aiassistancedone',
                () => {
                  resolve();
                },
                {
                  once: true,
                },
            );
          });
        });

        await devtoolsPage.keyboard.press('Enter');
        await done;
        abort.abort();

        const logs = await devtoolsPage.evaluate(() => {
          return localStorage.getItem('aiAssistanceStructuredLog');
        });
        if (!logs) {
          throw new Error('No aiAssistanceStructuredLog entries were found.');
        }
        const results = JSON.parse(logs) as IndividualPromptRequestResponse[];

        return results.map(r => ({...r, exampleId: this.id()}));
      };

      for (const query of this.#queries) {
        this.log(
            `[Info]: Running the user prompt "${query}" (This step might take long time)`,
        );
        // The randomness needed for evading query caching on the AIDA side.
        const result = await prompt(`${query} ${`${(Math.random() * 1000)}`.split('.')[0]}`);
        results.push(...result);
      }

      await this.#page.close();

      return {
        results,
        metadata: {exampleId: this.id(), explanation: this.#explanation},
      };

    } finally {
      const elapsedTime = numberFormatter.format(
          (performance.now() - executionStartTime) / 1000,
      );
      this.log(`Finished (${elapsedTime}s)`);
    }
  }

  log(text: string) {
    const indexOfExample = exampleUrls.indexOf(this.#url);
    logger.log(
        this.#url,
        indexOfExample,
        `\x1b[33m[${indexOfExample + 1}/${exampleUrls.length}] ${this.id()}:\x1b[0m ${text}`,
    );
  }

  error(text: string) {
    const indexOfExample = exampleUrls.indexOf(this.#url);
    logger.log(
        this.#url,
        indexOfExample,
        `\x1b[33m[${indexOfExample + 1}/${exampleUrls.length}] ${this.id()}:\x1b[0m \x1b[31m${text}\x1b[0m`,
    );
  }
}

const logger = new Logger();

async function runInParallel(examples: Example[]): Promise<RunResult> {
  logger.head('Preparing examples...');
  for (const example of examples) {
    await example.prepare();
  }

  logger.head('Running examples...');
  const allExampleResults: IndividualPromptRequestResponse[] = [];
  const metadata: ExampleMetadata[] = [];
  await Promise.all(
      examples.filter(example => example.isReady()).map(async example => {
        try {
          const {results, metadata: singleMetadata} = await example.execute();
          allExampleResults.push(...results);
          metadata.push(singleMetadata);
        } catch (err) {
          example.error(
              `There is an error, skipping it.\n${err instanceof Error ? logger.formatError(err) : err}`,
          );
        }
      }),
  );

  return {allExampleResults, metadata};
}

async function runSequentially(examples: Example[]): Promise<RunResult> {
  const allExampleResults: IndividualPromptRequestResponse[] = [];
  const metadata: ExampleMetadata[] = [];
  logger.head('Running examples sequentially...');
  for (const example of examples) {
    await example.prepare();
    if (!example.isReady()) {
      continue;
    }

    try {
      const {results, metadata: singleMetadata} = await example.execute();
      allExampleResults.push(...results);
      metadata.push(singleMetadata);
    } catch (err) {
      example.error(
          `There is an error, skipping it.\n${err instanceof Error ? logger.formatError(err) : err}`,
      );
    }
  }

  return {allExampleResults, metadata};
}

async function main() {
  logger.head('Connecting to the browser...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
    targetFilter: target => {
      if (target.url().startsWith('chrome-extension://')) {
        return false;
      }
      return true;
    },
  });
  logger.head('Browser connection is ready...');

  // Close any non about:blank pages. There should be only one
  // about:blank page and DevTools should be closed manually for it.
  logger.head(
      'Getting browser pages... (If stuck in here, please close all the tabs in the connected Chrome manually.)',
  );
  try {
    for (const page of await browser.pages()) {
      if (page.url() === 'about:blank') {
        continue;
      }
      await page.close();
    }
  } catch (err) {
    logger.head(
        `There was an error closing pages\n${err instanceof Error ? err.stack : err}`,
    );
  }

  logger.head('Preparing examples...');
  const examples = exampleUrls.map(exampleUrl => new Example(exampleUrl, browser));
  let allExampleResults: IndividualPromptRequestResponse[] = [];
  let metadata: ExampleMetadata[] = [];

  if (userArgs.parallel) {
    ({allExampleResults, metadata} = await runInParallel(examples));
  } else {
    ({allExampleResults, metadata} = await runSequentially(examples));
  }

  await browser.disconnect();

  let score = 0;
  {
    let scoreSum = 0;
    let count = 0;
    for (const example of allExampleResults) {
      if (example.score !== undefined) {
        scoreSum += example.score;
        count++;
      }
    }
    score = scoreSum / count;
  }

  /**
   * When multiple examples are run, the structure of this object is that
   * the metadata is an array with one item per example that defines the
   * example ID and the explanation.
   * `examples` is an array of all requests & responses across all the
   * examples. Each has an `exampleId` field to allow it to be assigned to
   * an individual example.
   */
  const output = {
    score,
    metadata,
    examples: allExampleResults,
  };

  const dateSuffix = new Date().toISOString().slice(0, 19);
  const outputPath = path.resolve(
      OUTPUT_DIR,
      `${userArgs.label}-${dateSuffix}.json`,
  );
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.info(
      `\n[Info]: Finished exporting results to ${outputPath}, it took ${formatElapsedTime()}`,
  );
  logger.destroy();
}

void main();
