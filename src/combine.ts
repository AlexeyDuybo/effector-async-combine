import {
  combine,
  createEffect,
  createEvent,
  createStore,
  Effect,
  EventCallable,
  is,
  sample,
  StoreValue,
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

class ResetError extends Error {}
class AbortError extends Error {}
class SkipError extends Error {}
class CombineError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super();

    this.cause = cause;
  }

  logged = false;
}

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

export const isAsyncCombine = (
  thing: unknown,
): thing is AsyncCombine<unknown> =>
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

type PrevSource = undefined | { prevSource: unknown };

type SourceStore = Store<
  undefined | (() => Promise<{ source: unknown }>) | { source: unknown }
>;

type ExecuterParams = {
  prevData: unknown;
  currentState: CombineState<unknown>;

  checkSourceEquality: boolean;
  source: StoreValue<SourceStore>;
  prevSource: PrevSource;

  newCtr: AbortController;
  prevCtr: AbortController;

  extension?: ExtensionParams;
};

const runInternalFx = createEffect(
  ({
    ctr,
    promise,
  }: {
    ctr: AbortController;
    promise: Promise<unknown>;
  }): Promise<any> => {
    if (ctr.signal.aborted) throw new AbortError();
    return new Promise((res, rej) => {
      ctr.signal.addEventListener(
        "abort",
        () => {
          rej(new AbortError());
        },
        { once: true },
      );
      promise.then(res, rej);
    });
  },
);

const runFx = <T>(ctr: AbortController, promise: Promise<T>): Promise<T> =>
  runInternalFx({ ctr, promise });

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
      newCtr,
      prevCtr,
      currentState,

      checkSourceEquality,
      source,
      prevSource,

      prevData,

      extension,
    }: ExecuterParams) => {
      prevCtr.abort();
      let loadingSet = false;
      const setLoading = () => {
        if (loadingSet) return;
        loadingSet = true;
        setState({
          isReady: false,
          isPending: true,
          prevData,
          ...(currentState?.isError
            ? { isError: true, error: currentState.error }
            : { isError: false }),
        });
      };

      const promise = (async () => {
        try {
          await runFx(newCtr, Promise.resolve());

          if (source === undefined) throw new ResetError();

          let sourceValue: unknown;
          if (typeof source === "function") {
            const sourcePromise = source();

            const setImidiateLoading = !(await runFx(
              newCtr,
              Promise.race([
                sourcePromise,
                Promise.resolve().then(() => false),
              ]),
            ));

            if (setImidiateLoading) {
              setLoading();
            }

            sourceValue = (await runFx(newCtr, sourcePromise)).source;
          } else {
            sourceValue = source.source;
          }

          if (
            checkSourceEquality &&
            prevSource !== undefined &&
            !sourceUpdateFilter(prevSource.prevSource, sourceValue)
          ) {
            throw new SkipError();
          }

          const baseContext: ContextShape = {
            signal: newCtr.signal,
            prevSource: prevSource?.prevSource,
          };

          setLoading();

          const data = await runFx(
            newCtr,
            (async () => {
              try {
                if (initedExtOrFunc.type === "func") {
                  return await initedExtOrFunc.fn(
                    sourceValue,
                    baseContext,
                    prevData,
                  );
                } else {
                  const { originalFn, configs } = initedExtOrFunc.ext;
                  const extensionFunc = createExtensionFunc(
                    originalFn,
                    configs,
                  );
                  return await extensionFunc(
                    sourceValue,
                    { ...baseContext, prevData },
                    extension,
                  );
                }
              } catch (error) {
                if (error === undefined) throw new ResetError();
                throw error;
              }
            })(),
          );

          setStateAndPrevSource({
            state: {
              isError: false,
              isPending: false,
              isReady: true,
              data,
            },
            prevSource: sourceValue,
          });

          return data;
        } catch (error) {
          if (error instanceof ResetError) {
            setState(undefined);
            throw error;
          }
          if (error instanceof SkipError) {
            setState(currentState);
            throw error;
          }
          if (error instanceof AbortError) {
            throw error;
          }

          const combineError =
            error instanceof CombineError ? error : new CombineError(error);

          if (!combineError.logged) {
            console.error(combineError.cause);
            combineError.logged = true;
          }

          setState({
            isError: true,
            isPending: false,
            isReady: false,
            prevData,
            error: combineError.cause,
          });

          throw combineError;
        } finally {
          newCtr.abort();
        }
      })();

      setPromise(() => promise);

      return promise;
    },
  );

  const setStateAndPrevSource = createEvent<{
    state: CombineState<unknown>;
    prevSource: unknown;
  }>();
  const setState = createEvent<CombineState<unknown>>();
  const $state = createStore<CombineState<unknown>>(undefined, {
    skipVoid: false,
    updateFilter: (s1, s2) => {
      if (s1 === s2) return false;
      if (s1 === undefined || s2 === undefined) return true;

      const obj1: Record<string, unknown> = s1;
      const obj2: Record<string, unknown> = s2;

      return keys.some((key) => obj1[key] !== obj2[key]);
    },
  })
    .on(setState, (_, state) => state)
    .on(setStateAndPrevSource, (_, { state }) => state);

  const setPromise = createEvent<() => Promise<unknown>>();
  const $promise = createStore<undefined | (() => Promise<unknown>)>(
    undefined,
    { skipVoid: false },
  )
    .on(setPromise, (_, promise) => promise)
    .on($state, (promise, state) => (state ? promise : undefined));

  const $source = getSourceStore(sourceShape);

  const $prevSource = createStore<undefined | { prevSource: unknown }>(
    undefined,
    { skipVoid: false },
  )
    .on(setStateAndPrevSource, (_, { prevSource }) => ({ prevSource }))
    .on($state, (params, state) => (state ? params : undefined));

  const $ctr = createStore(new AbortController()).on(
    executerFx,
    (_, { newCtr }) => newCtr,
  );

  const $prevData = $state.map(
    (state) => {
      return state?.isReady ? state.data : state?.prevData;
    },
    { skipVoid: false },
  );
  const trigger = createEvent<{ _extension: ExtensionParams } | void>();
  const changeData = createEvent<unknown>();

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
        checkSourceEquality: false,
        extension: p?._extension,
      })),
      $source.map(
        (): Pick<ExecuterParams, "checkSourceEquality" | "extension"> => ({
          checkSourceEquality: true,
        }),
      ),
    ],
    source: {
      currentState: $state,
      prevCtr: $ctr,
      prevSource: $prevSource,
      source: $source,
      prevData: $prevData,
    },
    fn: (source, clock): ExecuterParams => {
      return {
        ...source,
        ...clock,
        newCtr: new AbortController(),
      };
    },
    target: executerFx,
  });

  sample({
    clock: changeData,
    source: $ctr,
    fn: (ctr, data): CombineState<unknown> => {
      ctr.abort();
      return {
        isReady: true,
        isError: false,
        isPending: false,
        data,
      };
    },
    target: [
      $state,
      $prevSource.reinit,
      setPromise.prepend(
        (state: CombineState<unknown>) => () =>
          Promise.resolve(state?.isReady && state.data),
      ),
    ],
  });

  if (config.onError) {
    sample({
      clock: executerFx.failData,
      filter: (err) => err instanceof CombineError,
      fn: (err) => err.cause,
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
    // @ts-expect-error internal
    __: { $promise },
  };

  return combined as any;
};

const getSourceStore = (sourceShape: SourceShape): SourceStore => {
  if (is.store(sourceShape)) return sourceShape.map((source) => ({ source }));
  if (isAsyncCombine(sourceShape)) {
    // @ts-expect-error interna;
    const $promise = sourceShape.__.$promise as Store<
      (() => Promise<unknown>) | undefined
    >;
    return $promise.map(
      (promiseFactory) => {
        return (
          promiseFactory &&
          (() => promiseFactory().then((source) => ({ source })))
        );
      },
      { skipVoid: false },
    );
  }

  const storeObject = Object.fromEntries(
    Object.entries(sourceShape).map(
      ([key, source]) =>
        [
          key,
          isAsyncCombine(source)
            ? // @ts-expect-error internal
              (source.__.$promise as Store<
                (() => Promise<unknown>) | undefined
              >)
            : source,
        ] as const,
    ),
  );

  return combine(
    storeObject,
    (objectValues) => {
      const combineEntries: [string, Promise<unknown>][] = [];
      const storeEntries: [string, unknown][] = [];

      for (const key in objectValues) {
        const storeValueOrPromiseFactory = objectValues[key];
        const formattedKey = key.replace(/^\$/, "").replace(/Async$/, "");

        if (is.store(sourceShape[key])) {
          storeEntries.push([formattedKey, storeValueOrPromiseFactory]);
          continue;
        }

        if (storeValueOrPromiseFactory === undefined) return undefined;

        combineEntries.push([formattedKey, storeValueOrPromiseFactory()]);
      }

      if (combineEntries.length === 0) {
        return { source: Object.fromEntries(storeEntries) };
      }

      return async () => {
        const combineValues = await Promise.all(
          combineEntries.map(
            async ([key, promise]) => [key, await promise] as const,
          ),
        );

        return {
          source: Object.fromEntries([...storeEntries, ...combineValues]),
        };
      };
    },
    { skipVoid: false },
  );
};

const initExtensions = (
  trigger: EventCallable<{ _extension: ExtensionParams } | void>,
  executerFx: Effect<ExecuterParams, unknown>,
  $state: Store<CombineState<unknown>>,
  fnOrExt: CombineFuncOrExtension<any, any, {}, any, {}>,
  configuredExt?: Extension<any, any, any, any, any>,
):
  | {
      type: "func";
      fn: CombineFunc<SourceShape, unknown, ContextShape<SourceShape>>;
    }
  | {
      type: "ext";
      ext: {
        originalFn: CombineFunc<
          SourceShape,
          unknown,
          ContextShape<SourceShape>
        >;
        extend: Record<string, unknown>;
        configs: ExtensionConfig<unknown, unknown, unknown, unknown, unknown>[];
      };
    } => {
  if (!configuredExt && typeof fnOrExt === "function")
    return {
      type: "func",
      fn: fnOrExt,
    };

  const originalFn = typeof fnOrExt === "function" ? fnOrExt : fnOrExt.__.fn;

  const configFactories = [
    ...(typeof fnOrExt === "function" ? [] : fnOrExt.__.configFactories),
  ];

  if (configuredExt) {
    configFactories.unshift(...configuredExt(originalFn).__.configFactories);
  }

  const extConfigs = configFactories.map((configFactory, extensionIndex) => {
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
  });

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
    type: "ext",
    ext: { extend, configs: extConfigs, originalFn },
  };
};

export const asyncCombine: AsyncCombineCreator<{}, {}, unknown> =
  asyncCombineInternal;
