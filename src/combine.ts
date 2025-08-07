import {
  combine,
  createEffect,
  createEvent,
  createStore,
  Effect,
  EventCallable,
  is,
  sample,
  Store,
} from "effector";

import {
  createExtensionFunc,
  Extension,
  ExtensionConfig,
  ExtensionResult,
} from "./extension";
import {
  AsyncCombine,
  CombineFunc,
  CombineState,
  ContextShape,
  GetSourceValue,
  SourceShape,
} from "./types";
import { isEqual } from "./lib/equal";

class AbortError extends Error {}
const toAbortError = () => new AbortError();
const isAbortError = (err: unknown): err is AbortError =>
  err instanceof AbortError;

type CombineFuncOrExtension<
  Source extends SourceShape,
  Data,
  ConfiguredContext extends Record<string, any>,
  Extra extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
> =
  | CombineFunc<Source, Data, ContextShape<Source> & ConfiguredContext>
  | ExtensionResult<Source, Data, ConfiguredContext, Extra, ConfiguredExtra>;

type StateKeys<S = NonNullable<CombineState<unknown>>> = S extends any
  ? keyof S
  : never;

export type CombineConfig<SourceValue = unknown> = {
  onError?: EventCallable<unknown> | Effect<unknown, any>;
  sourceUpdateFilter?: (prev: SourceValue, next: SourceValue) => boolean;
};

export type AsyncCombineCreator<
  ConfiguredContext extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
  ConfiguredDataShape,
> = <
  Source extends SourceShape,
  Data extends ConfiguredDataShape | Promise<ConfiguredDataShape>,
  Extra extends Record<string, any> = {},
>(
  source: Source,
  fn: CombineFuncOrExtension<
    Source,
    Data,
    ConfiguredContext,
    Extra,
    ConfiguredExtra
  >,
  config?: CombineConfig<GetSourceValue<Source>>,
) => AsyncCombine<Awaited<Data>> & Extra & ConfiguredExtra;

const combineSymbol = Symbol("combine");

const isCombine = (thing: unknown): thing is AsyncCombine<unknown> =>
  typeof thing === "object" && thing !== null && combineSymbol in thing;

const sourceUpdateFilterDeep = (prev: unknown, next: unknown): boolean => {
  return !isEqual(prev, next);
};

const keys: StateKeys[] = [
  "data",
  "error",
  "isError",
  "isPending",
  "isReady",
  "prevData",
];

type ExtensionParams = {
  index: number;
  params?: unknown;
};

const resetSymbol = Symbol("reset");

type ExecuterParams = {
  prevData: unknown;

  source: unknown;
  prevSource: unknown;

  newCtr: AbortController;
  prevCtr: AbortController;

  extension?: ExtensionParams;
};

const asyncCombineInternal: AsyncCombineCreator<{}, {}, unknown> = (
  sourceShape,
  fnOrExt,
  config = {},
  ...[configuredExt]: Extension<any, any, any, any, any>[]
) => {
  const sourceUpdateFilter = (config.sourceUpdateFilter ??
    sourceUpdateFilterDeep) as (prev: unknown, next: unknown) => boolean;

  const executerFx = createEffect(
    async ({
      prevData,

      source,
      prevSource,

      newCtr,
      prevCtr,

      extension,
    }: ExecuterParams) => {
      prevCtr.abort();
      if (newCtr.signal.aborted) {
        throw toAbortError();
      }
      return new Promise((res, rej) => {
        newCtr.signal.addEventListener(
          "abort",
          () => {
            rej(toAbortError());
          },
          { once: true },
        );

        const baseContext: ContextShape = {
          signal: newCtr.signal,
          prevSource,
        };

        Promise.resolve()
          .then(() => {
            if (initedExtOrFunc.type === "func") {
              return initedExtOrFunc.fn(
                source as any,
                baseContext,
                prevData as any,
              );
            } else {
              const { originalFn, configs } = initedExtOrFunc.ext;

              const extensionFunc = createExtensionFunc(originalFn, configs);
              return extensionFunc(
                source,
                { ...baseContext, prevData },
                extension,
              );
            }
          })
          .then(res, (err) => {
            if (err === undefined) {
              res(resetSymbol);
            } else {
              rej(err);
            }
          })
          .finally(() => {
            newCtr.abort();
          });
      });
    },
  );

  const batchUpdatesFx = createEffect(
    async (params: {
      ctr: AbortController;
      skipSourceFilter: boolean;
      extension?: ExtensionParams;
    }) => params,
  );

  const $source = getSourceStore(sourceShape);

  const $prevSource = createStore<unknown>(undefined, { skipVoid: false });
  const $batchCtr = createStore(new AbortController());
  const $ctr = createStore(new AbortController()).on(
    executerFx,
    (_, { newCtr }) => newCtr,
  );

  const trigger = createEvent<{ _extension: ExtensionParams } | void>();
  const changeData = createEvent<unknown>();

  const $state = createStore<CombineState<unknown>>(undefined, {
    skipVoid: false,
    updateFilter: (s1, s2) => {
      if (s1 === s2) return false;
      if (s1 === undefined || s2 === undefined) return true;

      const obj1: Record<string, unknown> = s1;
      const obj2: Record<string, unknown> = s2;

      return keys.some((key) => obj1[key] !== obj2[key]);
    },
  });
  const $prevData = $state.map(
    (state) => (state?.isReady ? state.data : state?.prevData),
    { skipVoid: false },
  );

  const initedExtOrFunc = initExtensions(
    trigger,
    executerFx,
    $state,
    fnOrExt,
    configuredExt,
  );

  sample({
    clock: [
      trigger.map((p) => ({
        skipSourceFilter: true,
        extension: p?._extension,
      })),
      $source.map(() => ({ skipSourceFilter: false })),
    ],
    source: $batchCtr,
    fn: (batchCtr, clc) => {
      batchCtr.abort();
      const ctr = new AbortController();
      return {
        skipSourceFilter: clc.skipSourceFilter,
        ctr,
        extension: "extension" in clc ? clc.extension : undefined,
      };
    },
    target: batchUpdatesFx,
  });

  sample({
    clock: batchUpdatesFx,
    fn: ({ ctr }) => ctr,
    target: $batchCtr,
  });

  sample({
    clock: batchUpdatesFx.doneData,
    source: {
      source: $source,
      prevData: $prevData,
    },
    // TOTO test this line
    filter: ({ source }, { ctr }) =>
      !ctr.signal.aborted && !source.combineStatuses.isReady,
    fn: (
      { source: { combineStatuses }, prevData },
      batch,
    ): CombineState<unknown> => {
      if (!combineStatuses.isInited) return undefined;
      if (combineStatuses.isError)
        return {
          isReady: false,
          isPending: combineStatuses.isPending || false,
          isError: true,
          prevData,
        };

      if (combineStatuses.isPending)
        return {
          isReady: false,
          isPending: true,
          isError: false,
          prevData,
        };
    },
    target: $state,
  });

  sample({
    clock: batchUpdatesFx.doneData,
    source: {
      prevData: $prevData,
      prevCtr: $ctr,
      source: $source,
      prevSource: $prevSource,
    },
    filter: ({ prevSource, source }, { skipSourceFilter, ctr }) =>
      source.combineStatuses.isReady &&
      !ctr.signal.aborted &&
      (skipSourceFilter ? true : sourceUpdateFilter(prevSource, source.source)),
    fn: ({ source, prevSource, prevCtr, prevData }, batching) => {
      const newCtr = new AbortController();
      return {
        prevData,
        source: source.source,
        prevSource,
        newCtr,
        prevCtr,
        extension: batching.extension,
      };
    },
    target: executerFx,
  });

  sample({
    clock: batchUpdatesFx.finally,
    fn: ({ params: { ctr } }) => {
      ctr.abort(); // чтобы не висел хендлер
    },
  });

  sample({
    clock: executerFx,
    source: $state,
    fn: (state, { prevData, source }): CombineState<unknown> => {
      return {
        isReady: false,
        isError: state?.isError || false,
        isPending: true,
        prevData,
        error: (state?.isError && state?.error) || undefined,
      };
    },
    target: $state,
  });

  sample({
    clock: executerFx.doneData,
    fn: (data): CombineState<unknown> => {
      if (data === resetSymbol) return undefined;
      return {
        isReady: true,
        isError: false,
        isPending: false,
        data,
      };
    },
    target: $state,
  });

  sample({
    clock: executerFx.done,
    fn: ({ params: { source } }) => source,
    target: $prevSource,
  });

  sample({
    clock: executerFx.failData,
    source: $prevData,
    filter: (_, err) => !isAbortError(err),
    fn: (prevData, err): CombineState<unknown> => ({
      isError: true,
      isReady: false,
      isPending: false,
      prevData,
      error: err,
    }),
    target: $state,
  });

  sample({
    clock: changeData,
    source: {
      ctr: $ctr,
      batchCtr: $batchCtr,
    },
    fn: ({ ctr, batchCtr }, data): CombineState<unknown> => {
      ctr.abort();
      batchCtr.abort();
      return {
        isReady: true,
        isError: false,
        isPending: false,
        data,
      };
    },
    target: [$state, $prevSource.reinit] as const,
  });

  if (config.onError) {
    sample({
      clock: executerFx.failData,
      filter: (err) => !isAbortError(err),
      target: [config.onError] as const,
    });
  }

  const combined: AsyncCombine<unknown> & {
    [combineSymbol]: typeof combineSymbol;
  } = {
    ...(initedExtOrFunc.type === "ext" && initedExtOrFunc.ext.extend),
    $state,
    $data: $prevData,
    $isError: $state.map((state) => state?.isError || false),
    $isPending: $state.map((state) => state?.isPending || false),

    trigger: trigger as EventCallable<void>,
    changeData,

    [combineSymbol]: combineSymbol,
  };

  return combined as any;
};

function getSourceStore(sourceShape: SourceShape): Store<{
  source: unknown;
  combineStatuses: {
    isInited: boolean;
    isReady: boolean;
    isError: boolean;
    isPending: boolean;
  };
}> {
  if (is.store(sourceShape))
    return sourceShape.map((source) => ({
      source,
      combineStatuses: {
        isInited: true,
        isReady: true,
        isError: false,
        isPending: false,
      },
    }));

  if (isCombine(sourceShape))
    return sourceShape.$state.map((state) => {
      return {
        source: state?.isReady ? state.data : undefined,
        combineStatuses: {
          isInited: !!state,
          isReady: !!state?.isReady,
          isError: !!state?.isError,
          isPending: !!state?.isPending,
        },
      };
    });

  const storeObject: Record<string, Store<unknown>> = {};
  const combineObject: Record<string, Store<CombineState<unknown>>> = {};

  Object.entries(sourceShape).forEach(([sourceKey, sourceThing]): void => {
    const withoutPrefixKey = sourceKey.replace(/^\$/, "");

    if (is.store(sourceThing)) {
      storeObject[withoutPrefixKey] = sourceThing;
      return;
    }
    if (isCombine(sourceThing)) {
      combineObject[withoutPrefixKey] = sourceThing.$state;
      return;
    }
  });

  if (Object.keys(combineObject).length === 0) {
    return combine(storeObject, (source) => ({
      source,
      combineStatuses: {
        isInited: true,
        isReady: true,
        isError: false,
        isPending: false,
      },
    }));
  }

  return combine(
    combine(storeObject),
    combine(combineObject),
    (storeObject, combineObject) => {
      const isInited = !Object.values(combineObject).includes(undefined);

      if (!isInited)
        return {
          source: undefined,
          combineStatuses: {
            isInited: false,
            isReady: false,
            isError: false,
            isPending: false,
          },
        };

      const isError = Object.values(combineObject).some(
        (state) => state?.isError,
      );
      const isPending = Object.values(combineObject).some(
        (state) => state?.isPending,
      );
      const isReady = Object.values(combineObject).every(
        (state) => state?.isReady,
      );

      const combinesDataObject = Object.fromEntries(
        Object.entries(combineObject).map(
          ([key, state]) =>
            [key, state?.isReady ? state.data : undefined] as const,
        ),
      );

      return {
        source: {
          ...storeObject,
          ...combinesDataObject,
        },
        combineStatuses: {
          isInited: true,
          isReady,
          isError,
          isPending,
        },
      };
    },
  );
}

const initExtensions = (
  trigger: EventCallable<{ _extension: ExtensionParams } | void>,
  executerFx: Effect<ExecuterParams, unknown>,
  $state: Store<CombineState<unknown>>,
  fnOrExt: CombineFuncOrExtension<any, any, {}, any, {}>,
  configuredExt?: Extension<any, any, any, any, any>,
): 
| {
  type: 'func',
  fn: CombineFunc<SourceShape, unknown, ContextShape<SourceShape>>
} 
| {
  type: 'ext',
  ext: {
    originalFn: CombineFunc<SourceShape, unknown, ContextShape<SourceShape>>;
    extend: Record<string, unknown>;
    configs: ExtensionConfig<unknown, unknown, unknown, unknown, unknown>[];
  }
} => {
  if (!configuredExt && typeof fnOrExt === 'function') return {
    type: 'func',
    fn: fnOrExt,
  };

  const originalFn = typeof fnOrExt === 'function'
    ? fnOrExt
    : fnOrExt.__.fn;

  const configFactories = [
    ...typeof fnOrExt === 'function' 
      ? []
      : fnOrExt.__.configFactories
  ];

  if (configuredExt) {
    configFactories.unshift(
      ...(configuredExt(originalFn).__.configFactories)
    )
  }

  const extConfigs = configFactories.map(
    (configFactory, extensionIndex) => {
      const $stateWithParams = createStore($state.defaultState, {
        skipVoid: false,
      });

      sample({
        clock: $state,
        source: executerFx,
        fn: ({ extension }, state) =>
          !state?.isPending
            ? state
            : {
                ...state,
                params:
                  (extension &&
                    extension.index === extensionIndex &&
                    extension.params) ||
                  undefined,
              },
        target: $stateWithParams,
      });

      const config = configFactory({
        $state: $stateWithParams,
        trigger: trigger.prepend((params) => ({
          _extension: { index: extensionIndex, params },
        })),
      });

      return config;
    },
  );

  const extend = extConfigs.reduce<Record<string, unknown>>(
    (acc, config, extensionIndex) => {
      if (!config.extend) return acc;

      return {
        ...acc,
        ...config.extend,
      };
    },
    {},
  );

  return {
    type: 'ext',
    ext: { extend, configs: extConfigs, originalFn }
  };
};

export const asyncCombine: AsyncCombineCreator<{}, {}, unknown> = asyncCombineInternal;