import type * as Platform from '../platform/platform.js';

export type LocalizeString = (id: string, values?: Record<string, any>) => Platform.UIString.LocalizedString;
export type LazyLocalizeString = () => Platform.UIString.LocalizedString;

export declare const i18n: {
  registerUIStrings: (path: string, stringStructure: Record<string, string>) => Record<string, string>,
  getLocalizedString: (
      str: Record<string, string>, i18nId: string, values?: Record<string, any>) => Platform.UIString.LocalizedString,
  getLazilyComputedLocalizedString: (
      str: Record<string, string>, i18nId: string, values?: Record<string, any>) => Platform.UIString.LocalizedString,
  lockedLazyString: (str: string) => Platform.UIString.LocalizedString,
  lockedString: (str: string) => Platform.UIString.LocalizedString,
};

export declare const ByteUtilities: {
  bytesToString: (bytes: number) => {__i18nBytes: number},
};

export declare const TimeUtilities: {
  millisToString: (millis: number, higherResolution?: boolean) => {__i18nMillis: number},
};
