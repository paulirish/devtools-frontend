'use strict';

const path = require('path');
const rule = require('../lib/consistent-tagged-arithmetic.js');  // Adjust path as needed

const {RuleTester} = require('./utils/utils.js');

// --- Setup Fixtures ---
// Create directory: `lib/rules/fixtures`
// Add `lib/rules/fixtures/tsconfig.json` (see minimal version in step 1)
// Add `lib/rules/fixtures/types.ts` (same TypeScript definitions as before):
/*
export type Micro = number & { _tag: 'MicroSeconds' };
export function Micro(value: number): Micro {
  return value as Micro;
}

export type Milli = number & { _tag: 'MilliSeconds' };
export function Milli(value: number): Milli {
  return value as Milli;
}

export declare function processMicro(val: Micro): void;
export declare function processMilli(val: Milli): void;
export declare function getMicro(): Micro;
export declare function getMilli(): Milli;
export declare function getConfigNum(): number;
export declare function returnsMicro(): Micro;
*/

// --- Test Cases (Identical code strings, make sure 'filename' is provided) ---

new RuleTester().run('consistent-tagged-arithmetic', rule, {
  valid: [
    // Correct casting/construction
    {
      code: `
        import { Micro, Milli } from './types';
        const m1: Micro = Micro(100);
        const m2: Micro = Micro(50);
        const num: number = 10;
        const sum: Micro = (m1 + m2) as Micro;
        const scaled: Micro = (m1 * num) as Micro;
        const diff: Micro = (m1 - m2) as Micro;
        const ratio: Micro = (m1 / num) as Micro;
        const constructedSum: Micro = Micro(m1 + m2);
      `,
      filename: 'fixtures/valid.ts',  // Still linting TS code
    },
    // Assigning tagged type to number is fine
    {
      code: `
        import { Micro } from './types';
        const m1 = Micro(100);
        const result: number = m1 + 5;
      `,
      filename: 'fixtures/valid.ts',
    },
    // Using constructor functions
    {
      code: `
        import { Micro, Milli } from './types';
        const m1 = Micro(100);
        const m2 = Milli(50);
        const m3: Micro = Micro(m1);
      `,
      filename: 'fixtures/valid.ts',
    },
    // Correct function arguments/return types with casts
    {
      code: `
        import { Micro, Milli, processMicro, returnsMicro } from './types';
        const m1 = Micro(100);
        const n = 5;
        processMicro((m1 * n) as Micro);

        function calc(): Micro {
          const m_a = Micro(10);
          const m_b = Micro(20);
          return (m_a + m_b) as Micro;
        }
        function calcConstruct(): Micro {
          const m_a = Micro(10);
          return Micro(m_a * n);
        }
      `,
      filename: 'fixtures/valid.ts',
    },
    // Arithmetic result assigned to number
    {
      code: `
            import { Micro } from './types';
            const m1 = Micro(100);
            const m2 = Micro(200);
            const numResult: number = m1 + m2;
        `,
      filename: 'fixtures/valid.ts',
    },
    // Dividing two tagged types results in number (usually correct)
    {
      code: `
            import { Micro } from './types';
            const m1 = Micro(100);
            const m2 = Micro(10);
            const ratio: number = m1 / m2;
        `,
      filename: 'fixtures/valid.ts',
    }
  ],
  invalid: [
    // Missing cast on variable assignment
    {
      code: `
        import { Micro } from './types';
        const m1 = Micro(100);
        const m2 = Micro(50);
        const sum: Micro = m1 + m2; // Error
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Missing cast on assignment expression
    {
      code: `
        import { Micro } from './types';
        let m1 = Micro(100);
        const m2 = Micro(50);
        m1 = m1 + m2; // Error
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Assigning number literal without cast/constructor
    {
      code: `
        import { Micro } from './types';
        const m1: Micro = 100; // Error
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Missing cast on return statement
    {
      code: `
        import { Micro, returnsMicro } from './types';
        function calc(): Micro {
          const m_a = Micro(10);
          const m_b = Micro(20);
          return m_a + m_b; // Error
        }
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Missing cast on function argument
    {
      code: `
        import { Micro, processMicro } from './types';
        const m1 = Micro(100);
        const n = 5;
        processMicro(m1 * n); // Error
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Mixed tags in arithmetic
    {
      code: `
        import { Micro, Milli } from './types';
        const m1 = Micro(100);
        const m2 = Milli(50);
        const result = m1 + m2; // Error directly on BinaryExpression if not in checked context
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{messageId: 'mixedTags', data: {leftTag: 'MicroSeconds', rightTag: 'MilliSeconds'}}],
    },
    // Mixed tags assigned to specific tag (will likely trigger missingCast)
    {
      code: `
        import { Micro, Milli } from './types';
        const m1 = Micro(100);
        const m2 = Milli(50);
        const sum: Micro = m1 + m2; // Error
      `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
    // Assigning result of division of tagged types to a tagged type without cast
    {
      code: `
            import { Micro } from './types';
            const m1 = Micro(100);
            const m2 = Micro(10);
            const ratio: Micro = m1 / m2; // Error: division results in number
        `,
      filename: 'fixtures/invalid.ts',
      errors: [{
        messageId: 'missingCast',
        data: {expectedTag: 'MicroSeconds', expectedTypeString: 'Micro', expectedConstructor: 'Micro'}
      }],
    },
  ],
});
