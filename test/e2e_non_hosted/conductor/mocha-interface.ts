// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Mocha from 'mocha';
import type {CommonFunctions, CreateOptions, SuiteFunctions, TestFunctions} from 'mocha/lib/interfaces/common';
// @ts-expect-error
import * as commonInterface from 'mocha/lib/interfaces/common.js';
import * as Path from 'path';

import {platform, type Platform} from '../../conductor/platform.js';
import {TestConfig} from '../../conductor/test_config.js';

import {makeInstrumentedTestFunction} from './mocha-interface-helpers.js';
import {StateProvider} from './state-provider.js';

type SuiteFunction = ((this: Mocha.Suite) => void)|undefined;

function devtoolsTestInterface(rootSuite: Mocha.Suite) {
  let defaultImplementation: CommonFunctions;
  let mochaGlobals: Mocha.MochaGlobals;
  let mochaRoot: Mocha;
  rootSuite.on(
      Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE,
      (context: Mocha.MochaGlobals, file: string, mocha: Mocha) => {
        mochaGlobals = context;
        mochaRoot = mocha;
        // Different module outputs between tsc and esbuild.
        const defaultFactory = ('default' in commonInterface ? commonInterface.default : commonInterface);
        defaultImplementation = defaultFactory([rootSuite], context, mocha) as CommonFunctions;
        // @ts-expect-error Custom interface.
        context.before = instumentWith(defaultImplementation.before);
        // @ts-expect-error Custom interface.
        context.after = instumentWith(defaultImplementation.after);
        // @ts-expect-error Custom interface.
        context.beforeEach = instumentWith(defaultImplementation.beforeEach);
        // @ts-expect-error Custom interface.
        context.afterEach = instumentWith(defaultImplementation.afterEach);

        if (mocha.options.delay) {
          context.run = defaultImplementation.runWithSuite(rootSuite);
        }
        // @ts-expect-error Custom interface.
        context.describe = customDescribe(defaultImplementation.suite, file);
      },
  );
  rootSuite.on(Mocha.Suite.constants.EVENT_SUITE_ADD_SUITE, (suite: Mocha.Suite) => {
    // @ts-expect-error Custom interface.
    mochaGlobals.setup = function(suiteSettings: SuiteSettings) {
      StateProvider.instance.registerSettingsCallback(suite, suiteSettings);
    };
    const it = customIt(defaultImplementation.test, suite, suite.file || '', mochaRoot);
    // @ts-expect-error Custom interface.
    mochaGlobals.it = it;
  });
}

function instumentWith(withDefaultFn: (fn: Mocha.AsyncFunc) => void) {
  const name = withDefaultFn.name;
  return (fn: Mocha.AsyncFunc) => withDefaultFn(makeInstrumentedTestFunction(fn, name));
}

function describeTitle(file: string, title: string) {
  const parsedPath = Path.parse(file);
  const directories = parsedPath.dir.split(Path.sep);
  const index = directories.lastIndexOf('e2e_non_hosted');
  let prefix = parsedPath.name;
  if (index >= 0) {
    prefix = [...directories.slice(index + 1), `${parsedPath.name}.ts`].join('/');
  }
  if (title.includes(prefix)) {
    return title;
  }
  return `${prefix}: ${title}`;
}

function customDescribe(suiteImplementation: SuiteFunctions, file: string) {
  function withAugmentedTitle(suiteFn: (opts: CreateOptions) => Mocha.Suite) {
    return (title: string, fn: SuiteFunction) => {
      const suite = suiteFn({
        title: describeTitle(file, title),
        file,
        fn,
      });

      if (!suite.isPending()) {
        suite.beforeAll(async function(this: Mocha.Context) {
          this.timeout(0);
          await StateProvider.instance.resolveBrowser(suite);
        });
      }
      return suite;
    };
  }

  const describe = withAugmentedTitle(suiteImplementation.create);
  // @ts-expect-error Custom interface.
  describe.only = withAugmentedTitle(suiteImplementation.only);
  // @ts-expect-error Custom interface.
  describe.skip = withAugmentedTitle(suiteImplementation.skip);
  return describe;
}

function iterationSuffix(iteration: number): string {
  if (iteration === 0) {
    return '';
  }
  return ` (#${iteration})`;
}
function customIt(testImplementation: TestFunctions, suite: Mocha.Suite, file: string, mocha: Mocha) {
  function instrumentWithState(fn: E2E.TestAsyncCallbackWithState) {
    const fnWithState = async function(this: Mocha.Context) {
      return await StateProvider.instance.callWithState(this, suite, fn);
    };
    return makeInstrumentedTestFunction(fnWithState, 'test');
  }

  function createTest(title: string, fn?: Mocha.AsyncFunc) {
    const test = new Mocha.Test(title, suite.isPending() || !fn ? undefined : instrumentWithState(fn));
    test.file = file;
    suite.addTest(test);
    return test;
  }

  // Regular mocha it returns the test instance.
  // It is not possible with TestConfig.repetitions.
  const localIt = function(title: string, fn?: Mocha.AsyncFunc) {
    for (let i = 0; i < TestConfig.repetitions; i++) {
      const iterationTitle = title + iterationSuffix(i);
      createTest(iterationTitle, fn);
    }
  };
  localIt.skip = function(title: string, _fn: Mocha.AsyncFunc) {
    // no fn to skip.
    return createTest(title);
  };
  localIt.only = function(title: string, fn: Mocha.AsyncFunc) {
    for (let i = 0; i < TestConfig.repetitions; i++) {
      const iterationTitle = title + iterationSuffix(i);
      testImplementation.only(mocha, createTest(iterationTitle, fn));
    }
  };
  localIt.skipOnPlatforms = function(platforms: Platform[], title: string, fn: Mocha.AsyncFunc) {
    const shouldSkip = platforms.includes(platform);
    if (shouldSkip) {
      return localIt.skip(title, fn);
    }
    return localIt(title, fn);
  };

  return localIt;
}

devtoolsTestInterface.description = 'DevTools test interface';

module.exports = devtoolsTestInterface;
