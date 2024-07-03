
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

const rule = require('../lib/enforce-optional-properties-last.js');
const ruleTester = new (require('eslint').RuleTester)({
  parserOptions: {ecmaVersion: 9, sourceType: 'module'},
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('optional-properties-last', rule, {
  valid: [
    {
      code: `
        type ValidType = {
          name: string;
          age?: number;
        };
      `,
    },
    {
      code: `
        type AnotherValidType = {
          isActive: boolean;
          address?: string;
          email?: string;
        };
      `,
    },
  ],

  invalid: [
    {
      code: `
        type InvalidType = {
          name?: string;
          age: number;
        };
      `,
      errors: [
        {
          message: 'Optional property \'name\' should be defined after required properties.',
          type: 'TSPropertySignature'
        },
      ],
      output: `
        type InvalidType = {
          age: number;
          name?: string;
        };
      `,
    },
    {
      code: `
        type AnotherInvalidType = {
          isCool?: boolean;
          isAwesome: boolean;
          job?: string;
        };
      `,
      errors: [
        {
          message: 'Optional property \'isCool\' should be defined after required properties.',
          type: 'TSPropertySignature'
        },
      ],
      output: `
        type AnotherInvalidType = {
          isAwesome: boolean;
          isCool?: boolean;
          job?: string;
        };
      `,
    },
  ],
});
