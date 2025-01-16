// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const puppeteer = require('puppeteer-core');
const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const fs = require('fs');
const path = require('path');
const {parseComment} = require('./auto-run-helpers');

const DEFAULT_FOLLOW_UP_QUERY = 'Fix the issue using JavaScript code execution.';

const startTime = performance.now();
const numberFormatter = new Intl.NumberFormat('en-EN', {maximumSignificantDigits: 3});
const acquiredDevToolsTargets = new WeakMap();
function formatElapsedTime() {
  return `${numberFormatter.format((performance.now() - startTime) / 1000)}s`;
}

const userArgs = yargs(hideBin(process.argv))
                     .option('example-urls', {
                       string: true,
                       type: 'array',
                       demandOption: true,
                     })
                     .option('parallel', {
                       boolean: true,
                       default: true,
                     })
                     .option('label', {string: true, default: 'run'})
                     .option('include-follow-up', {
                       boolean: true,
                       default: false,
                     })
                     .parseSync();

const OUTPUT_DIR = path.resolve(__dirname, 'data');

class Logger {
  /** @type {import('./types').Logs} */
  #logs = {};
  /** @type {NodeJS.Timeout|null} */
  #updateElapsedTimeInterval = null;

  constructor() {
    this.#updateElapsedTimeInterval = setInterval(() => {
      this.#updateElapsedTime();
    }, 1000);
  }

  #updateElapsedTime() {
    this.#logs['elapsedTime'] = {index: 999, text: `\nElapsed time: ${formatElapsedTime()}`};
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

  /**
   * Formats an error object for display.
   * @param {Error} err The error object to format.
   * @return {string} The formatted error string.
   */
  formatError(err) {
    const stack = typeof err.cause === 'object' && err.cause && 'stack' in err.cause ? err.cause.stack : '';
    return `${err.stack}${err.cause ? `\n${stack}` : ''}`;
  }

  /**
   * Logs a header message to the console.
   * @param {string} text The header text to log.
   */
  head(text) {
    this.log('head', -1, `${text}\n`);
  }

  /**
   * @param {string} id
   * @param {number} index
   * @param {string} text
   */
  log(id, index, text) {
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

class Example {
  /** @type {string} */
  #url;
  /** @type {puppeteer.Browser} */
  #browser;
  /** @type {boolean} */
  #ready = false;
  /** @type {puppeteer.Page|null} **/
  #page = null;
  /** @type {puppeteer.Page|null} **/
  #devtoolsPage = null;
  /** @type {Array<string>} **/
  #queries = [];
  /** @type {string} **/
  #explanation = '';
  /**
   * @param {string} url
   * @param {puppeteer.Browser} browser
   */
  constructor(url, browser) {
    this.#url = url;
    this.#browser = browser;
  }

  /**
   * @param {puppeteer.Page} page
   */
  async #generateMetadata(page) {
    /** @type {Array<string>} */
    const commentStringsFromPage = await page.evaluate(() => {
      /**
       * @param {Node|ShadowRoot} root
       * @return {Array<{comment: string, commentElement: Comment, targetElement: Element|null}>}
       */
      function collectComments(root) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_COMMENT,
        );
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
    const comments = commentStringsFromPage.map(comment => parseComment(comment));
    // Only get the first comment for now.
    const comment = comments[0];
    const queries = [comment.prompt];
    if (userArgs.includeFollowUp) {
      queries.push(DEFAULT_FOLLOW_UP_QUERY);
    }

    return {
      idx: 0,
      queries,
      explanation: comment.explanation,
    };
  }

  id() {
    return this.#url.split('/').pop()?.replace('.html', '') ?? 'unknown-id';
  }

  isReady() {
    return this.#ready;
  }

  async #prepare() {
    this.log('Creating a page');
    const page = await this.#browser.newPage();
    await page.goto(this.#url);
    this.log(`Navigated to ${this.#url}`);

    const devtoolsTarget = await this.#browser.waitForTarget(target => {
      const isAcquiredBefore = acquiredDevToolsTargets.has(target);
      return target.type() === 'other' && target.url().startsWith('devtools://') && !isAcquiredBefore;
    });
    acquiredDevToolsTargets.set(devtoolsTarget, true);

    const {idx, queries, explanation} = await this.#generateMetadata(page);
    this.log('[Info]: Running...');
    // Strip comments to prevent LLM from seeing it.
    await page.evaluate(() => {
      // @ts-expect-error we don't type globalThis.__commentElements
      for (const {commentElement} of globalThis.__commentElements) {
        commentElement.remove();
      }
    });

    const devtoolsPage = await devtoolsTarget.asPage();
    this.log('[Info]: Got devtools page');

    await devtoolsPage.keyboard.press('Escape');
    await devtoolsPage.keyboard.press('Escape');
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

    this.log('[Info]: Locating console');
    await devtoolsPage.locator(':scope >>> #tab-console').click();
    await devtoolsPage.locator('aria/Console prompt').click();
    await devtoolsPage.keyboard.type(`inspect(globalThis.__commentElements[${idx}].targetElement)`);
    await devtoolsPage.keyboard.press('Enter');

    this.log('[Info]: Locating AI assistance tab');
    await devtoolsPage.locator(':scope >>> #tab-elements').click();
    await devtoolsPage.locator('aria/Customize and control DevTools').click();
    await devtoolsPage.locator('aria/More tools').click();
    await devtoolsPage.locator('aria/AI assistance').click();
    this.log('[Info]: Opened AI assistance tab');

    this.#page = page;
    this.#devtoolsPage = devtoolsPage;
    this.#queries = queries;
    this.#explanation = explanation;
  }

  async prepare() {
    this.log('Getting prepared');
    try {
      await this.#prepare();
      this.#ready = true;
    } catch (err) {
      this.#ready = false;
      this.error(`Preparation failed.\n${err instanceof Error ? logger.formatError(err) : err}`);
    }
  }

  async execute() {
    if (!this.#devtoolsPage) {
      throw new Error('Cannot execute without DevTools page.');
    }
    if (!this.#page) {
      throw new Error('Cannot execute without target page');
    }
    const executionStartTime = performance.now();
    await this.#devtoolsPage.waitForFunction(() => {
      return 'setDebugFreestylerEnabled' in window;
    });

    await this.#devtoolsPage.evaluate(() => {
      // @ts-ignore this is run in the DevTools page context where this function does exist.
      setDebugFreestylerEnabled(true);
    });

    /** @type {Array<import('./types').IndividualPromptRequestResponse>} */
    const results = [];

    /**
     * @param {string} query
     * @returns {Promise<import('./types').IndividualPromptRequestResponse[]>}
     */
    const prompt = async query => {
      if (!this.#devtoolsPage) {
        throw new Error('Cannot prompt without DevTools page.');
      }
      const devtoolsPage = this.#devtoolsPage;
      await devtoolsPage.locator('aria/Ask a question about the selected element').click();

      await devtoolsPage.locator('aria/Ask a question about the selected element').fill(query);

      const abort = new AbortController();
      /**
       * @param {AbortSignal} signal AbortSignal to stop the operation.
       */
      const autoAcceptEvals = async signal => {
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
        return /** @type {Promise<void>} */ (new Promise(resolve => {
          window.addEventListener('freestylerdone', () => {
            resolve();
          }, {
            once: true,
          });
        }));
      });

      await devtoolsPage.keyboard.press('Enter');
      await done;
      abort.abort();

      const logs = await devtoolsPage.evaluate(() => {
        return localStorage.getItem('freestylerStructuredLog');
      });
      if (!logs) {
        throw new Error('No freestylerStructuredLog entries were found.');
      }
      /** @type {import('./types').IndividualPromptRequestResponse[]} */
      const results = JSON.parse(logs);

      return results.map(r => ({...r, exampleId: this.id()}));
    };

    for (const query of this.#queries) {
      this.log(`[Info]: Running the user prompt "${query}" (This step might take long time)`);
      const result = await prompt(query);
      results.push(...result);
    }

    await this.#page.close();
    const elapsedTime = numberFormatter.format((performance.now() - executionStartTime) / 1000);
    this.log(`Finished (${elapsedTime}s)`);

    /** @type {import('./types').ExecutedExample} */
    return {results, metadata: {exampleId: this.id(), explanation: this.#explanation}};
  }

  /**
   * @param {string} text
   */
  log(text) {
    const indexOfExample = userArgs.exampleUrls.indexOf(this.#url);
    logger.log(
        this.#url, indexOfExample,
        `\x1b[33m[${indexOfExample + 1}/${userArgs.exampleUrls.length}] ${this.id()}:\x1b[0m ${text}`);
  }

  /**
   * @param {string} text
   */
  error(text) {
    const indexOfExample = userArgs.exampleUrls.indexOf(this.#url);
    logger.log(
        this.#url, indexOfExample,
        `\x1b[33m[${indexOfExample + 1}/${userArgs.exampleUrls.length}] ${this.id()}:\x1b[0m \x1b[31m${text}\x1b[0m`);
  }
}

const logger = new Logger();

/**
 * @param {Example[]} examples
 * @return {Promise<import('./types').RunResult>}
 */
async function runInParallel(examples) {
  logger.head('Preparing examples...');
  for (const example of examples) {
    await example.prepare();
  }

  logger.head('Running examples...');
  /** @type {Array<import('./types').IndividualPromptRequestResponse>} **/
  const allExampleResults = [];
  /** @type {Array<import('./types').ExampleMetadata>} **/
  const metadata = [];
  await Promise.all(examples.filter(example => example.isReady()).map(async example => {
    try {
      const {results, metadata: singleMetadata} = await example.execute();
      allExampleResults.push(...results);
      metadata.push(singleMetadata);
    } catch (err) {
      example.error(`There is an error, skipping it.\n${err instanceof Error ? logger.formatError(err) : err}`);
    }
  }));

  return {allExampleResults, metadata};
}

/**
 * @param {Example[]} examples
 * @return {Promise<import('./types').RunResult>}
 */
async function runSequentially(examples) {
  /** @type {import('./types').IndividualPromptRequestResponse[]} */
  const allExampleResults = [];

  /** @type {import('./types').ExampleMetadata[]} */
  const metadata = [];
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
      example.error(`There is an error, skipping it.\n${err instanceof Error ? logger.formatError(err) : err}`);
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
      'Getting browser pages... (If stuck in here, please close all the tabs in the connected Chrome manually.)');
  try {
    for (const page of await browser.pages()) {
      if (page.url() === 'about:blank') {
        continue;
      }
      await page.close();
    }
  } catch (err) {
    logger.head(`There was an error closing pages\n${err instanceof Error ? err.stack : err}`);
  }

  logger.head('Preparing examples...');
  const examples = userArgs.exampleUrls.map(exampleUrl => new Example(exampleUrl, browser));
  /** @type {import('./types').IndividualPromptRequestResponse[]} */
  let allExampleResults = [];
  /** @type {import('./types').ExampleMetadata[]} */
  let metadata = [];

  if (userArgs.parallel) {
    ({allExampleResults, metadata} = await runInParallel(examples));
  } else {
    ({allExampleResults, metadata} = await runSequentially(examples));
  }

  await browser.disconnect();

  /**
   * When multiple examples are run, the structure of this object is that
   * the metadata is an array with one item per example that defines the
   * example ID and the explanation.
   * `examples` is an array of all requests & responses across all the
   * examples. Each has an `exampleId` field to allow it to be assigned to
   * an individaul example.
   */
  const output = {
    metadata,
    examples: allExampleResults,
  };

  const dateSuffix = new Date().toISOString().slice(0, 19);
  const outputPath = path.resolve(OUTPUT_DIR, `${userArgs.label}-${dateSuffix}.json`);
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.info(`\n[Info]: Finished exporting results to ${outputPath}, it took ${formatElapsedTime()}`);
  logger.destroy();
}

main();
