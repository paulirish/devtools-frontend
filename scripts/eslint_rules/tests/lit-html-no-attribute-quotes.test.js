// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

const rule = require('../lib/lit-html-no-attribute-quotes.js');
const tsParser = require('@typescript-eslint/parser');
const ruleTester = new (require('eslint').RuleTester)({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tsParser,
  },
});

ruleTester.run('lit-html-no-attribute-quotes', rule, {
  valid: [
    {
      code: 'LitHtml.html`<p class=${foo}>foo</p>`',
      filename: 'front_end/components/datagrid.ts',
    },
    {
      code: 'LitHtml.html`<p class=${foo}>"${someOutput}"</p>`',
      filename: 'front_end/components/datagrid.ts',
    },
    {
      code: 'html`<p class=${foo}>"${someOutput}"</p>`',
      filename: 'front_end/components/datagrid.ts',
    },
    {
      code: 'html`<p class="my-${fooClassName}">"${someOutput}"</p>`',
      filename: 'front_end/components/datagrid.ts',
    },
  ],
  invalid: [
    {
      code: 'LitHtml.html`<p class="${foo}">foo</p>`',
      filename: 'front_end/components/datagrid.ts',
      errors: [
        {messageId: 'attributeQuotesNotRequired', column: 26, line: 1},
      ],
      output: 'LitHtml.html`<p class=${foo}>foo</p>`',
    },
    {
      code: 'html`<p class="${foo}">foo</p>`',
      filename: 'front_end/components/datagrid.ts',
      errors: [{messageId: 'attributeQuotesNotRequired'}],
      output: 'html`<p class=${foo}>foo</p>`',
    },
  ],
});
