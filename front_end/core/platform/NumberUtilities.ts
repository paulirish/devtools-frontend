// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export const clamp = (num: number, min: number, max: number): number => {
  let clampedNumber = num;
  if (num < min) {
    clampedNumber = min;
  } else if (num > max) {
    clampedNumber = max;
  }
  return clampedNumber;
};

export const mod = (m: number, n: number): number => {
  return ((m % n) + n) % n;
};

export const toFixedIfFloating = (value: string): string => {
  if (!value || Number.isNaN(Number(value))) {
    return value;
  }
  const number = Number(value);
  return number % 1 ? number.toFixed(3) : String(number);
};

/**
 * Rounds a number (including float) down.
 */
export const floor = (value: number, precision: number = 0): number => {
  // Allows for rounding to the nearest whole number.
  // Ex: 1 / 10 -> round down to nearest 10th place
  // Ex: 1 / 5 -> round down to nearest 5
  // Ex: 1 / 50 -> round down to nearest 50
  if (precision > 0 && precision < 1) {
    precision = 1 / precision;
    return Math.floor(value / precision) * precision;
  }

  const mult = Math.pow(10, precision);
  return Math.floor(value * mult) / mult;
};

/**
 * Computes the great common divisor for two numbers.
 * If the numbers are floats, they will be rounded to an integer.
 */
export const greatestCommonDivisor = (a: number, b: number): number => {
  a = Math.round(a);
  b = Math.round(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
};

const commonRatios = new Map([
  ['8∶5', '16∶10'],
]);

export const aspectRatio = (width: number, height: number): string => {
  const divisor = greatestCommonDivisor(width, height);
  if (divisor !== 0) {
    width /= divisor;
    height /= divisor;
  }
  const result = `${width}∶${height}`;
  return commonRatios.get(result) || result;
};

// Space separator
export const withThousandsSeparator = function(num: number): string {
  let str = String(num);
  const re = /(\d+)(\d{3})/;
  while (str.match(re)) {
    str = str.replace(re, '$1\xA0$2');
  }  // \xa0 is a non-breaking space
  return str;
};

// https://stackoverflow.com/a/22885197
function getSignificantDigitCount(num: string): number {
  const log10 = Math.log(10);
  let n = Math.abs(parseInt(num.replace('.', ''), 10));  // remove decimal and make positive
  if (n === 0) {
    return 0;
  }
  while (n !== 0 && n % 10 === 0) {
    n /= 10;
  }                                            // kill the 0s at the end of n
  return Math.floor(Math.log(n) / log10) + 1;  // get number of digits
}

// Constructing this formatter is costly, just do it once.
let formatter: Intl.NumberFormat|null = null;

export function withUnderscoreThousandsSeparator(num: string): string {
  if (!formatter) {
    // Undefined locale uses the user's preferred locale, in case their thousand formatting rules are different. (Unlikely)
    formatter = Intl.NumberFormat(undefined, {maximumFractionDigits: 20});
  }

  // Number.MAX_SAFE_INTEGER is 16 digits, and larger numbers in exponential notation are 17 chars long
  // While most 16-digit numbers should be ok, better to not risk it
  if (getSignificantDigitCount(num) < 16) {
    const parts = formatter.formatToParts(parseFloat(num));
    parts.filter(p => p.type === 'group').forEach(p => {
      p.value = '_';
    });
    const reformatted = parts.map(p => p.value).join('');
    return reformatted;
  }
  return num;
}
