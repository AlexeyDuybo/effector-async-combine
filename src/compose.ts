import { Extension, ExtensionResult, ExtensionShape } from "./extension";
import { CombineFunc, ContextShape, SourceShape } from "./types";

export declare function composeExtensionsInternal<
  ContextExtension1 extends Record<string, any>,
  ConfiguredContext1 extends Record<string, any>,
  DataShape1,
  ExtraExtension1 extends Record<string, any>,
  ConfiguredExtra1 extends Record<string, any>,
  ContextExtension2 extends Record<string, any> &
    Partial<Record<keyof ContextExtension1, never>>,
  ConfiguredContext2 extends Record<string, any>,
  DataShape2,
  ExtraExtension2 extends Record<string, any> &
    Partial<Record<keyof ExtraExtension1, never>>,
  ConfiguredExtra2 extends Record<string, any>,
>(
  ext1: ExtensionShape<
    ContextExtension1,
    ConfiguredContext1,
    DataShape1,
    ExtraExtension1,
    ConfiguredExtra1
  >,

  ext2: ExtensionShape<
    ContextExtension2,
    ConfiguredContext2,
    DataShape2,
    ExtraExtension2,
    ConfiguredExtra2
  >,
): Extension<
  DataShape1 & DataShape2,
  ConfiguredContext1 & ConfiguredContext2,
  ContextExtension1 & ContextExtension2,
  ExtraExtension1 & ExtraExtension2,
  ConfiguredExtra1 & ConfiguredExtra2
>;
export declare function composeExtensionsInternal<
  ContextExtension1 extends Record<string, any>,
  ConfiguredContext1 extends Record<string, any>,
  DataShape1,
  ExtraExtension1 extends Record<string, any>,
  ConfiguredExtra1 extends Record<string, any>,
  ContextExtension2 extends Record<string, any> &
    Partial<Record<keyof ContextExtension1, never>>,
  ConfiguredContext2 extends Record<string, any>,
  DataShape2,
  ExtraExtension2 extends Record<string, any> &
    Partial<Record<keyof ExtraExtension1, never>>,
  ConfiguredExtra2 extends Record<string, any>,
  ContextExtension3 extends Record<string, any> &
    Partial<Record<keyof ContextExtension1 | keyof ContextExtension2, never>>,
  ConfiguredContext3 extends Record<string, any>,
  DataShape3,
  ExtraExtension3 extends Record<string, any> &
    Partial<Record<keyof ExtraExtension1 | keyof ExtraExtension2, never>>,
  ConfiguredExtra3 extends Record<string, any>,
>(
  ext1: ExtensionShape<
    ContextExtension1,
    ConfiguredContext1,
    DataShape1,
    ExtraExtension1,
    ConfiguredExtra1
  >,

  ext2: ExtensionShape<
    ContextExtension2,
    ConfiguredContext2,
    DataShape2,
    ExtraExtension2,
    ConfiguredExtra2
  >,

  ext3: ExtensionShape<
    ContextExtension3,
    ConfiguredContext3,
    DataShape3,
    ExtraExtension3,
    ConfiguredExtra3
  >,
): Extension<
  DataShape1 & DataShape2 & DataShape3,
  ConfiguredContext1 & ConfiguredContext2 & ConfiguredContext3,
  ContextExtension1 & ContextExtension2 & ContextExtension3,
  ExtraExtension1 & ExtraExtension2 & ExtraExtension3,
  ConfiguredExtra1 & ConfiguredExtra2 & ConfiguredExtra3
>;
export declare function composeExtensionsInternal<
  ContextExtension1 extends Record<string, any>,
  ConfiguredContext1 extends Record<string, any>,
  DataShape1,
  ExtraExtension1 extends Record<string, any>,
  ConfiguredExtra1 extends Record<string, any>,
  ContextExtension2 extends Record<string, any> &
    Partial<Record<keyof ContextExtension1, never>>,
  ConfiguredContext2 extends Record<string, any>,
  DataShape2,
  ExtraExtension2 extends Record<string, any> &
    Partial<Record<keyof ExtraExtension1, never>>,
  ConfiguredExtra2 extends Record<string, any>,
  ContextExtension3 extends Record<string, any> &
    Partial<Record<keyof ContextExtension1 | keyof ContextExtension2, never>>,
  ConfiguredContext3 extends Record<string, any>,
  DataShape3,
  ExtraExtension3 extends Record<string, any> &
    Partial<Record<keyof ExtraExtension1 | keyof ExtraExtension2, never>>,
  ConfiguredExtra3 extends Record<string, any>,
  ContextExtension4 extends Record<string, any> &
    Partial<
      Record<
        | keyof ContextExtension1
        | keyof ContextExtension2
        | keyof ContextExtension3,
        never
      >
    >,
  ConfiguredContext4 extends Record<string, any>,
  DataShape4,
  ExtraExtension4 extends Record<string, any> &
    Partial<
      Record<
        keyof ExtraExtension1 | keyof ExtraExtension2 | keyof ExtraExtension3,
        never
      >
    >,
  ConfiguredExtra4 extends Record<string, any>,
>(
  ext1: ExtensionShape<
    ContextExtension1,
    ConfiguredContext1,
    DataShape1,
    ExtraExtension1,
    ConfiguredExtra1
  >,

  ext2: ExtensionShape<
    ContextExtension2,
    ConfiguredContext2,
    DataShape2,
    ExtraExtension2,
    ConfiguredExtra2
  >,

  ext3: ExtensionShape<
    ContextExtension3,
    ConfiguredContext3,
    DataShape3,
    ExtraExtension3,
    ConfiguredExtra3
  >,

  ext4: ExtensionShape<
    ContextExtension4,
    ConfiguredContext4,
    DataShape4,
    ExtraExtension4,
    ConfiguredExtra4
  >,
): Extension<
  DataShape1 & DataShape2 & DataShape3 & DataShape4,
  ConfiguredContext1 &
    ConfiguredContext2 &
    ConfiguredContext3 &
    ConfiguredContext4,
  ContextExtension1 & ContextExtension2 & ContextExtension3 & ContextExtension4,
  ExtraExtension1 & ExtraExtension2 & ExtraExtension3 & ExtraExtension4,
  ConfiguredExtra1 & ConfiguredExtra2 & ConfiguredExtra3 & ConfiguredExtra4
>;

export const composeExtensions = ((
  ...exts: Extension<any, any, any, any, any>[]
) => {
  const ext = (fn: CombineFunc<SourceShape, unknown, ContextShape>) => {
    const configFactories = [
      ...new Set(exts.map((ext) => ext(fn).__.configFactories).flat()),
    ];

    const extResult: ExtensionResult<any, any, any, any, any> = {
      __: {
        // @ts-expect-error
        fn: fn,
        configFactories,
      },
    };

    return extResult;
  };

  return ext;
}) as unknown as typeof composeExtensionsInternal;
