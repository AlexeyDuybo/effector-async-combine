import { AsyncCombineCreator, CombineConfig, asyncCombine } from "./combine";
import { ExtensionCreator, ExtensionShape, createExtension } from "./extension";

export function fromConfiguration<
  DataShape = unknown,
  ContextExtension extends Record<string, any> = {},
  ExtraExtension extends Record<string, any> = {},
>(
  configured: {
    extension?: ExtensionShape<
      ContextExtension,
      Record<string, never>,
      DataShape,
      ExtraExtension,
      Record<string, never>
    >;
  } & CombineConfig<unknown>,
): {
  asyncCombine: AsyncCombineCreator<
    ContextExtension,
    ExtraExtension,
    DataShape
  >;
  createExtension: ExtensionCreator<
    ContextExtension,
    ExtraExtension,
    DataShape
  >;
} {
  return {
    asyncCombine: (source, fn, config) => {
      return asyncCombine(
        source, 
        fn as any, 
        { ...configured, ...config },
        // @ts-expect-error
        configured.extension
      );
    },
    // @ts-expect-error
    createExtension,
  };
}
