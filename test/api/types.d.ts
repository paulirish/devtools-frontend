// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable @typescript-eslint/no-unused-vars */
import type * as Mocha from 'mocha';

import type * as Foundation from '../../front_end/foundation/foundation.js';
import type {InspectedPage as SharedInspectedPage} from '../conductor/inspected_page.js';

declare global {
  namespace Mocha {
    export interface TestFunction {
      (title: string, fn: API.TestAsyncCallbackWithState): void;
    }

    export interface ExclusiveTestFunction {
      (title: string, fn: API.TestAsyncCallbackWithState): void;
    }

    export interface HookFunction {
      (fn: API.SuiteSettings): void;
    }

    export interface Test {
      realDuration?: number;
    }

    export interface Suite {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      browser?: any;
    }
  }

  namespace API {
    export type InspectedPage = SharedInspectedPage;

    export interface SuiteSettings {
      creationOptions?: Partial<Foundation.Universe.CreationOptions>;
      targetUrl?: string;
    }

    export interface State {
      inspectedPage: InspectedPage;
      universe: Foundation.Universe.Universe;
    }

    export type TestAsyncCallbackWithState = (this: undefined, state: State) => PromiseLike<unknown>;
  }
}
