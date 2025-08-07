import { EventCallable, Store } from "effector";

export type ContextShape<Source extends SourceShape = any> = {
  signal: AbortSignal;
  prevSource?: GetSourceValue<Source>;
};

export type IsNever<T, Then, Else> = [T] extends [never] ? Then : Else;

export type SourceShape =
  | Store<any>
  | Record<string, Store<any> | AsyncCombine<any>>
  | AsyncCombine<any>;

export type RemoveDollarPrefix<Name extends string> =
  Name extends `$${infer ValueName}` ? ValueName : Name;

export type GetSourceValue<Source extends SourceShape> =
  Source extends Store<infer Value>
    ? Value
    : Source extends AsyncCombine<infer Value>
      ? Value
      : {
          [K in keyof Source &
            string as RemoveDollarPrefix<K>]: Source[K] extends Store<
            infer Value
          >
            ? Value
            : Source[K] extends AsyncCombine<infer Value>
              ? Value
              : never;
        };

export type CombineState<Data, Params = never> =
  | undefined
  | { isReady: true; isPending: false; isError: false; data: Data }
  | ({
      isReady: false;
      isPending: true;
      isError: true;
      prevData?: Data;
      error?: unknown;
    } & IsNever<Params, unknown, { params?: Params }>)
  | ({
      isReady: false;
      isPending: true;
      isError: false;
      prevData?: Data;
    } & IsNever<Params, unknown, { params?: Params }>)
  | ({
      isReady: false;
      isPending: true;
      isError: true;
      prevData?: Data;
      error?: unknown;
    } & IsNever<Params, unknown, { params?: Params }>)
  | {
      isReady: false;
      isPending: false;
      isError: true;
      prevData?: Data;
      error?: unknown;
    };

export type AsyncCombine<Data> = {
  $state: Store<CombineState<Data>>;
  $data: Store<Data | undefined>;
  $isError: Store<boolean>;
  $isPending: Store<boolean>;
  changeData: EventCallable<Data>;
  trigger: EventCallable<void>;
};

export type CombineFunc<Source extends SourceShape, Data, Context> = (
  source: GetSourceValue<Source>,
  context: Context,
  prevData?: Awaited<Data> | Data,
) => Data | Promise<Data>;
