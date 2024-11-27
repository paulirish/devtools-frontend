// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Host from '../../core/host/host.js';
import type * as LitHtml from '../../ui/lit-html/lit-html.js';

import {AiHistoryStorage} from './AiHistoryStorage.js';

export const enum ResponseType {
  CONTEXT = 'context',
  TITLE = 'title',
  THOUGHT = 'thought',
  ACTION = 'action',
  SIDE_EFFECT = 'side-effect',
  ANSWER = 'answer',
  ERROR = 'error',
  QUERYING = 'querying',
  USER_QUERY = 'user-query',
}

export const enum ErrorType {
  UNKNOWN = 'unknown',
  ABORT = 'abort',
  MAX_STEPS = 'max-steps',
}

export interface AnswerResponse {
  type: ResponseType.ANSWER;
  text: string;
  rpcId?: number;
  suggestions?: [string, ...string[]];
}

export interface ErrorResponse {
  type: ResponseType.ERROR;
  error: ErrorType;
  rpcId?: number;
}

export interface ContextDetail {
  title: string;
  text: string;
  codeLang?: string;
}
export interface ContextResponse {
  type: ResponseType.CONTEXT;
  title: string;
  details: [ContextDetail, ...ContextDetail[]];
}

export interface TitleResponse {
  type: ResponseType.TITLE;
  title: string;
  rpcId?: number;
}

export interface ThoughtResponse {
  type: ResponseType.THOUGHT;
  thought: string;
  rpcId?: number;
}

export interface SideEffectResponse {
  type: ResponseType.SIDE_EFFECT;
  code: string;
  confirm: (confirm: boolean) => void;
  rpcId?: number;
}

export interface ActionResponse {
  type: ResponseType.ACTION;
  code: string;
  output: string;
  canceled: boolean;
  rpcId?: number;
}

export interface QueryResponse {
  type: ResponseType.QUERYING;
  query: string;
}

export interface UserQuery {
  type: ResponseType.USER_QUERY;
  query: string;
}

export type ResponseData = AnswerResponse|ErrorResponse|ActionResponse|SideEffectResponse|ThoughtResponse|TitleResponse|
    QueryResponse|ContextResponse|UserQuery;

export interface BuildRequestOptions {
  text: string;
}

export interface RequestOptions {
  temperature?: number;
  modelId?: string;
}

export interface AgentOptions {
  aidaClient: Host.AidaClient.AidaClient;
  serverSideLoggingEnabled?: boolean;
}

export interface ParsedAnswer {
  answer: string;
  suggestions?: [string, ...string[]];
}

export interface ParsedStep {
  thought?: string;
  title?: string;
  action?: string;
}

export type ParsedResponse = ParsedAnswer|ParsedStep;

export const enum AgentType {
  FREESTYLER = 'freestyler',
  DRJONES_FILE = 'drjones-file',
  DRJONES_NETWORK_REQUEST = 'drjones-network-request',
  DRJONES_PERFORMANCE = 'drjones-performance',
}

export interface SerializedAgent {
  id: string;
  type: AgentType;
  history: HistoryEntryStorage;
}

const MAX_STEP = 10;
export type HistoryEntryStorage = ResponseData[];

export abstract class ConversationContext<T> {
  abstract getOrigin(): string;
  abstract getItem(): T;
  abstract getIcon(): HTMLElement;
  abstract getTitle(): string|ReturnType<typeof LitHtml.Directives.until>;

  isOriginAllowed(agentOrigin: string|undefined): boolean {
    if (!agentOrigin) {
      return true;
    }
    // Currently does not handle opaque origins because they
    // are not available to DevTools, instead checks
    // that serialization of the origin is the same
    // https://html.spec.whatwg.org/#ascii-serialisation-of-an-origin.
    return this.getOrigin() === agentOrigin;
  }

  /**
   * This method is called at the start of `AiAgent.run`.
   * It will be overriden in subclasses to fetch data related to the context item.
   */
  async refresh(): Promise<void> {
    return;
  }
}

export abstract class AiAgent<T> {
  static validTemperature(temperature: number|undefined): number|undefined {
    return typeof temperature === 'number' && temperature >= 0 ? temperature : undefined;
  }

  abstract type: AgentType;
  #id: string = crypto.randomUUID();
  readonly #sessionId: string = crypto.randomUUID();
  #aidaClient: Host.AidaClient.AidaClient;
  #serverSideLoggingEnabled: boolean;
  abstract readonly preamble: string;
  abstract readonly options: RequestOptions;
  abstract readonly clientFeature: Host.AidaClient.ClientFeature;
  abstract readonly userTier: string|undefined;
  abstract handleContextDetails(select: ConversationContext<T>|null): AsyncGenerator<ContextResponse, void, void>;
  #generatedFromHistory = false;

  /**
   * Historical responses.
   */
  #history: HistoryEntryStorage = [];
  /**
   * Might need to be part of history in case we allow chatting in
   * historical conversations.
   */
  #origin?: string;
  #context?: ConversationContext<T>;
  #structuredLog: Array<{
    request: Host.AidaClient.AidaRequest,
    response: string,
    rawResponse?: Host.AidaClient.AidaResponse,
  }> = [];

  constructor(opts: AgentOptions) {
    this.#aidaClient = opts.aidaClient;
    this.#serverSideLoggingEnabled = opts.serverSideLoggingEnabled ?? false;
  }

  get chatHistoryForTesting(): Array<Host.AidaClient.Content> {
    return this.#chatHistoryForAida;
  }

  set chatNewHistoryForTesting(history: HistoryEntryStorage) {
    this.#history = history;
  }

  get id(): string {
    return this.#id;
  }

  get isEmpty(): boolean {
    return this.#history.length === 0;
  }

  get origin(): string|undefined {
    return this.#origin;
  }

  get context(): ConversationContext<T>|undefined {
    return this.#context;
  }

  get title(): string|undefined {
    return this.#history
        .filter(response => {
          return response.type === ResponseType.USER_QUERY;
        })
        .at(0)
        ?.query;
  }

  get isHistoryEntry(): boolean {
    return this.#generatedFromHistory;
  }

  serialized(): SerializedAgent {
    return {
      id: this.id,
      type: this.type,
      history: this.#history,
    };
  }

  populateHistoryFromStorage(entry: SerializedAgent): void {
    this.#id = entry.id;
    this.#history = entry.history;
    this.#generatedFromHistory = true;
  }

  async *
      aidaFetch(
          request: Host.AidaClient.AidaRequest,
          options?: {signal?: AbortSignal},
          ): AsyncGenerator<{parsedResponse: ParsedResponse, completed: boolean, rpcId?: number}, void, void> {
    let rawResponse: Host.AidaClient.AidaResponse|undefined = undefined;
    let response = '';
    let rpcId: number|undefined;
    for await (rawResponse of this.#aidaClient.fetch(request, options)) {
      response = rawResponse.explanation;
      rpcId = rawResponse.metadata.rpcGlobalId ?? rpcId;
      if (rawResponse.metadata.attributionMetadata?.some(
              meta => meta.attributionAction === Host.AidaClient.RecitationAction.BLOCK)) {
        throw new Error('Attribution action does not allow providing the response');
      }
      const parsedResponse = this.parseResponse(response);
      yield {rpcId, parsedResponse, completed: rawResponse.completed};
    }

    debugLog({
      request,
      response: rawResponse,
    });

    this.#structuredLog.push({
      request: structuredClone(request),
      response,
      rawResponse,
    });
    localStorage.setItem('freestylerStructuredLog', JSON.stringify(this.#structuredLog));
  }

  buildRequest(opts: BuildRequestOptions): Host.AidaClient.AidaRequest {
    const currentMessage = {parts: [{text: opts.text}], role: Host.AidaClient.Role.USER};
    const history = this.#chatHistoryForAida;
    const request: Host.AidaClient.AidaRequest = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      current_message: currentMessage,
      preamble: this.preamble,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      historical_contexts: history.length ? history : undefined,
      client: Host.AidaClient.CLIENT_NAME,
      options: {
        temperature: AiAgent.validTemperature(this.options.temperature),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        model_id: this.options.modelId,
      },
      metadata: {
        disable_user_content_logging: !(this.#serverSideLoggingEnabled ?? false),
        string_session_id: this.#sessionId,
        user_tier: Host.AidaClient.convertToUserTierEnum(this.userTier),
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      functionality_type: Host.AidaClient.FunctionalityType.CHAT,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      client_feature: this.clientFeature,
    };
    return request;
  }

  handleAction(action: string, rpcId?: number): AsyncGenerator<SideEffectResponse, ActionResponse, void>;
  handleAction(): never {
    throw new Error('Unexpected action found');
  }

  async enhanceQuery(query: string, selected: ConversationContext<T>|null): Promise<string>;
  async enhanceQuery(query: string): Promise<string> {
    return query;
  }

  parseResponse(response: string): ParsedResponse {
    return {
      answer: response,
    };
  }

  formatParsedAnswer({answer}: ParsedAnswer): string {
    return answer;
  }

  formatParsedStep(step: ParsedStep): string {
    let text = '';
    if (step.thought) {
      text = `THOUGHT: ${step.thought}`;
    }
    if (step.title) {
      text += `\nTITLE: ${step.title}`;
    }
    if (step.action) {
      text += `\nACTION
${step.action}
STOP`;
    }

    return text;
  }

  get #chatHistoryForAida(): Host.AidaClient.Content[] {
    const history: Array<Host.AidaClient.Content> = [];
    let currentParsedStep: ParsedStep = {};
    let lastRunStartIdx = 0;
    const flushCurrentStep = (): void => {
      const text = this.formatParsedStep(currentParsedStep);
      if (text) {
        history.push({
          role: Host.AidaClient.Role.MODEL,
          parts: [{text}],
        });
        currentParsedStep = {};
      }
    };
    for (const data of this.#history) {
      switch (data.type) {
        case ResponseType.CONTEXT:
        case ResponseType.SIDE_EFFECT:
          break;
        case ResponseType.USER_QUERY:
          lastRunStartIdx = history.length;
          break;
        case ResponseType.QUERYING: {
          flushCurrentStep();
          history.push({
            role: Host.AidaClient.Role.USER,
            parts: [{text: data.query}],
          });
          break;
        }
        case ResponseType.ANSWER:
          history.push({
            role: Host.AidaClient.Role.MODEL,
            parts: [{text: this.formatParsedAnswer({answer: data.text})}],
          });
          break;
        case ResponseType.TITLE:
          currentParsedStep.title = data.title;
          break;
        case ResponseType.THOUGHT:
          currentParsedStep.thought = data.thought;
          break;
        case ResponseType.ACTION:
          currentParsedStep.action = data.code;
          break;
        case ResponseType.ERROR:
          // Delete the end of history.
          history.splice(lastRunStartIdx);
          currentParsedStep = {};
          break;
      }
    }
    // Flush remaining step data into history.
    flushCurrentStep();
    return history;
  }

  #addHistory(data: ResponseData): void {
    this.#history.push(data);
    // Remove condition to store the history in storage
    if (isHistoryEnabled()) {
      void AiHistoryStorage.instance().upsertHistoryEntry(this.serialized());
    }
  }

  async * run(query: string, options: {
    signal?: AbortSignal, selected: ConversationContext<T>|null,
  }): AsyncGenerator<ResponseData, void, void> {
    if (this.#generatedFromHistory) {
      throw new Error('History entries are read-only.');
    }

    await options.selected?.refresh();

    // First context set on the agent determines its origin from now on.
    if (options.selected && this.#origin === undefined && options.selected) {
      this.#origin = options.selected.getOrigin();
    }
    // Remember if the context that is set.
    if (options.selected && !this.#context) {
      this.#context = options.selected;
    }

    const enhancedQuery = await this.enhanceQuery(query, options.selected);

    Host.userMetrics.freestylerQueryLength(enhancedQuery.length);

    // Request is built here to capture history up to this point.
    let request = this.buildRequest({text: enhancedQuery});

    const response = {
      type: ResponseType.USER_QUERY,
      query,
    } as const;
    this.#addHistory(response);
    yield response;

    for await (const response of this.handleContextDetails(options.selected)) {
      this.#addHistory(response);
      yield response;
    }

    query = enhancedQuery;

    for (let i = 0; i < MAX_STEP; i++) {
      const queryResponse = {
        type: ResponseType.QUERYING,
        query,
      } as const;
      this.#addHistory(queryResponse);
      yield queryResponse;
      let rpcId: number|undefined;
      let parsedResponse: ParsedResponse|undefined = undefined;
      try {
        for await (const fetchResult of this.aidaFetch(request, {signal: options.signal})) {
          rpcId = fetchResult.rpcId;
          parsedResponse = fetchResult.parsedResponse;

          // Only yield partial responses here and do not add partial answers to the history.
          if (!fetchResult.completed && 'answer' in parsedResponse && parsedResponse.answer) {
            yield {
              type: ResponseType.ANSWER,
              text: parsedResponse.answer,
              rpcId,
            };
          }
        }
      } catch (err) {
        debugLog('Error calling the AIDA API', err);

        if (err instanceof Host.AidaClient.AidaAbortError) {
          const response = {
            type: ResponseType.ERROR,
            error: ErrorType.ABORT,
            rpcId,
          } as const;
          this.#addHistory(response);
          yield response;
          break;
        }

        const response = {
          type: ResponseType.ERROR,
          error: ErrorType.UNKNOWN,
          rpcId,
        } as const;
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceError);
        this.#addHistory(response);
        yield response;

        break;
      }

      if (!parsedResponse) {
        const response = {
          type: ResponseType.ERROR,
          error: ErrorType.UNKNOWN,
          rpcId,
        } as const;
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceError);
        this.#addHistory(response);
        yield response;
        break;
      }

      if ('answer' in parsedResponse) {
        const {
          answer,
          suggestions,
        } = parsedResponse;
        if (answer) {
          const response = {
            type: ResponseType.ANSWER,
            text: answer,
            rpcId,
            suggestions,
          } as const;
          Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceAnswerReceived);
          this.#addHistory(response);
          yield response;
        } else {
          const response = {
            type: ResponseType.ERROR,
            error: ErrorType.UNKNOWN,
            rpcId,
          } as const;
          Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceError);
          this.#addHistory(response);
          yield response;
        }

        break;
      }

      const {
        title,
        thought,
        action,
      } = parsedResponse;

      if (title) {
        const response = {
          type: ResponseType.TITLE,
          title,
          rpcId,
        } as const;
        this.#addHistory(response);
        yield response;
      }

      if (thought) {
        const response = {
          type: ResponseType.THOUGHT,
          thought,
          rpcId,
        } as const;
        this.#addHistory(response);
        yield response;
      }

      if (action) {
        const result = yield* this.handleAction(action, rpcId);
        this.#addHistory(result);
        query = `OBSERVATION: ${result.output}`;
        // Capture history state for the next iteration query.
        request = this.buildRequest({text: query});
        yield result;
      }

      if (i === MAX_STEP - 1) {
        const response = {
          type: ResponseType.ERROR,
          error: ErrorType.MAX_STEPS,
        } as const;
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AiAssistanceError);
        this.#addHistory(response);
        yield response;
        break;
      }
    }
    if (isDebugMode()) {
      window.dispatchEvent(new CustomEvent('freestylerdone'));
    }
  }

  async * runFromHistory(): AsyncGenerator<ResponseData, void, void> {
    if (this.isEmpty) {
      return;
    }

    this.#generatedFromHistory = true;
    for (const entry of this.#history) {
      yield entry;
    }
  }
}

export function isDebugMode(): boolean {
  return Boolean(localStorage.getItem('debugFreestylerEnabled'));
}

export function debugLog(...log: unknown[]): void {
  if (!isDebugMode()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(...log);
}

function setDebugFreestylerEnabled(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem('debugFreestylerEnabled', 'true');
  } else {
    localStorage.removeItem('debugFreestylerEnabled');
  }
}
// @ts-ignore
globalThis.setDebugFreestylerEnabled = setDebugFreestylerEnabled;

export function isHistoryEnabled(): boolean {
  return Boolean(localStorage.getItem('persistentHistoryAiAssistance'));
}

function setAiAssistancePersistentHistory(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem('persistentHistoryAiAssistance', 'true');
  } else {
    localStorage.removeItem('persistentHistoryAiAssistance');
  }
}
// @ts-ignore
globalThis.setAiAssistancePersistentHistory = setAiAssistancePersistentHistory;
