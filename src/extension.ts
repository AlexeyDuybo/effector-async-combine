import { EventCallable, Store } from "effector";

import { CombineFunc, CombineState, ContextShape, SourceShape } from "./types";

type IsNever<T, Then, Else> = [T] extends [never] ? Then : Else;

export type ExtensionParams<DataShape = unknown, TriggerParams = never> = {
  $state: Store<CombineState<DataShape, TriggerParams>>;
  trigger: EventCallable<TriggerParams>;
};

export type ExtensionContextShape<Data> = {
  signal: AbortSignal;
  prevData?: Data;
};

type ExtensionData<DataShape> = {
  getData: () => DataShape;
} & (DataShape extends any[]
  ? { mergeWithPrevData: () => void }
  : DataShape extends Record<string, unknown>
    ? {
        [K in keyof DataShape]: DataShape[K] extends any[] ? K : never;
      } extends infer Obj
      ? [Obj[keyof Obj]] extends [infer ArrayKeys extends string]
        ? { mergeWithPrevData: (p: { arrayKey: ArrayKeys }) => void }
        : unknown
      : never
    : unknown);

export type ExtensionConfig<
  DataShape,
  TriggerParams,
  ConfiguredContext,
  ContextExtension,
  Extra,
> = {
  handler?: (
    originalFn: (
      context: IsNever<ContextExtension, void, ContextExtension>,
    ) => Promise<ExtensionData<DataShape>>,
    context: ConfiguredContext & ExtensionContextShape<DataShape>,
    triggerParams?: TriggerParams,
  ) => Promise<ExtensionData<DataShape>> | ExtensionData<DataShape>;
  extend?: Extra;
};

export type ExtensionCreator<
  ConfiguredContext extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
  ConfiguredDataShape,
> = <
  Config extends {
    context?: Partial<
      Record<keyof ConfiguredContext | keyof ContextShape, never>
    > &
      Record<string, any>;
    params?: unknown;
    data?: ConfiguredDataShape;
  } = {},
  DataShape = Config extends { data: infer Data } ? Data : ConfiguredDataShape,
  ContextExtension extends Record<string, any> = Config extends {
    context: infer Context;
  }
    ? NonNullable<Context>
    : never,
  TriggerParams = Config extends { params: infer Params } ? Params : void,
>() => <
  Extra extends Partial<Record<keyof ConfiguredExtra, never>> &
    Record<string, any> = {},
>(
  configFactory: (
    params: ExtensionParams<DataShape, TriggerParams>,
  ) => ExtensionConfig<
    DataShape,
    TriggerParams,
    ConfiguredContext,
    ContextExtension,
    Extra
  >,
) => Extension<
  DataShape,
  ConfiguredContext,
  IsNever<ContextExtension, {}, ContextExtension>,
  Extra,
  ConfiguredExtra
>;

type ExtensionFuncParams = {
  index: number;
  params?: unknown;
};

type ExtensionFunc = (
  source: unknown,
  context: ContextShape & { prevData?: unknown },
  triggerParams?: ExtensionFuncParams,
) => unknown;

export type ExtensionResult<
  Source extends SourceShape,
  Data,
  ConfiguredContext extends Record<string, any>,
  Extra extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
  __ extends (P: ConfiguredContext) => void = (P: ConfiguredContext) => void,
  ___ extends (P: ConfiguredExtra) => void = (P: ConfiguredExtra) => void,
> = {
  __: {
    fn: CombineFunc<SourceShape, unknown, unknown>;
    configFactories: ((
      params: ExtensionParams<unknown, unknown>,
    ) => ExtensionConfig<unknown, unknown, unknown, unknown, unknown>)[];
    types?: {
      source: Source;
      data: Data;
      configuredContext: ConfiguredContext;
      extra: Extra;
      configuredExtra: ConfiguredExtra;
    };
    context: __;
    extra: ___;
  };
};

export type ExtensionShape<
  ContextExtension extends Record<string, any>,
  ConfiguredContext extends Record<string, any>,
  DataShape,
  ExtraExtension extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
> = {
  _params?: {
    contextExtension: ContextExtension;
    configuredContext: ConfiguredContext;
    dataShape: DataShape;
    extraExtension: ExtraExtension;
    configuredExtra: ConfiguredExtra;
  };
};

export type Extension<
  DataShape,
  ConfiguredContext extends Record<string, any>,
  ContextExtension extends Record<string, any>,
  Extra extends Record<string, any>,
  ConfiguredExtra extends Record<string, any>,
> = ExtensionShape<
  ContextExtension,
  ConfiguredContext,
  DataShape,
  Extra,
  ConfiguredExtra
> &
  (<
    Source extends SourceShape,
    FuncData extends DataShape | Promise<DataShape>,
  >(
    func: CombineFunc<
      Source,
      FuncData,
      ContextShape<Source> & ConfiguredContext & ContextExtension
    >,
  ) => ExtensionResult<
    Source,
    FuncData,
    ConfiguredContext,
    Extra,
    ConfiguredExtra
  >);

// @ts-expect-error
export const createExtension: ExtensionCreator<{}, {}, unknown> = (
  configuredExtension?: Extension<any, any, any, any, any>,
) => {
  return (configFactory) => {
    const ext = (fn: CombineFunc<SourceShape, unknown, ContextShape>) => {
      const configFactories = [configFactory];

      if (configuredExtension) {
        configFactories.unshift(
          ...(configuredExtension(fn).__.configFactories as any[]),
        );
      }

      const extResult: ExtensionResult<any, any, any, any, any> = {
        // @ts-expect-error
        __: { fn: fn, configFactories },
      };

      return extResult;
    };

    return ext;
  };
};

const getNextExtFunc = (
  originalFunc: CombineFunc<SourceShape, unknown, ContextShape>,
  extConfigIndex: number,
  extConfigs: ExtensionConfig<any, any, any, any, any>[] | undefined[],
  baseContext: ContextShape & { prevData?: unknown },
  source: unknown,
  triggerParms?: ExtensionFuncParams,
  contextAcc?: Record<string, unknown>,
): ((
  contextExtension?: Record<string, unknown>,
) => Promise<ExtensionData<unknown>>) => {
  return async (contextExtension = {}) => {
    const extConfig = extConfigs[extConfigIndex];
    const extendedContxt = {
      ...baseContext,
      ...contextExtension,
      ...contextAcc,
    };
    if (!extConfig)
      return createExtensionData(
        originalFunc(
          source,
          { ...extendedContxt, ...contextAcc },
          baseContext.prevData,
        ),
        baseContext.prevData,
      );

    const nextExtFunc = getNextExtFunc(
      originalFunc,
      extConfigIndex + 1,
      extConfigs,
      baseContext,
      source,
      triggerParms,
      extendedContxt,
    );

    const handler = extConfig.handler;

    if (!handler) return nextExtFunc(contextExtension);

    return handler(
      nextExtFunc,
      extendedContxt,
      triggerParms?.index === extConfigIndex ? triggerParms.params : undefined,
    );
  };
};

export const createExtensionFunc = (
  originalFunc: CombineFunc<SourceShape, unknown, ContextShape>,
  extConfigs: ExtensionConfig<any, any, any, any, any>[],
): ExtensionFunc => {
  return async (source, context, triggerParams) => {
    const func = getNextExtFunc(
      originalFunc,
      0,
      extConfigs,
      context,
      source,
      triggerParams,
    );
    return (await func()).getData();
  };
};

const createExtensionData = (
  data: unknown,
  prevData: unknown | undefined,
): ExtensionData<unknown> => {
  let isMerged = false;

  const mergeWithPrevData:
    | ExtensionData<unknown[]>["mergeWithPrevData"]
    | ExtensionData<Record<string, unknown[]>>["mergeWithPrevData"] = (
    config,
  ) => {
    if (prevData === undefined || isMerged) return;
    isMerged = true;

    const nextDataArray =
      typeof config?.arrayKey === "string"
        ? !!data &&
          typeof data === "object" &&
          data[config.arrayKey as keyof typeof data]
        : data;

    if (!Array.isArray(nextDataArray))
      throw new Error(
        `[asyncCombine extension error]: merging with previous data allowed only for array, but got ${typeof nextDataArray}`,
      );

    const prevDataArray =
      typeof config?.arrayKey === "string"
        ? !!prevData &&
          typeof prevData === "object" &&
          prevData[config.arrayKey as keyof typeof prevData]
        : prevData;

    if (!Array.isArray(prevDataArray))
      throw new Error(
        `[asyncCombine extension error]: merging with previous data allowed only for array, but got ${typeof prevDataArray}`,
      );

    const mergedArray = [...prevDataArray, ...nextDataArray];

    data =
      typeof config?.arrayKey === "string"
        ? { ...(data as any), [config.arrayKey]: mergedArray }
        : mergedArray;
  };

  return {
    getData: () => data,
    // @ts-expect-error
    mergeWithPrevData: mergeWithPrevData as any,
  };
};
