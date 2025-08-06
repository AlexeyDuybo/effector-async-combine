import { createEvent, createStore } from "effector";
import { describe, it } from "vitest";
import { expectTypeOf } from "vitest";

import { asyncCombine, AsyncCombineCreator } from "./combine";
import { composeExtensions } from "./compose";
import {
  createExtension,
  ExtensionCreator,
  ExtensionParams,
} from "./extension";
import { fromConfiguration } from "./from-configuration";
import { AsyncCombine, ContextShape } from "./types";

describe("asyncCombine types", () => {
  it("state", () => {
    const combine = asyncCombine(createStore(1), () => "");

    const state = combine.$state.getState();

    if (state?.isError) {
      expectTypeOf(state.error).toEqualTypeOf<unknown>();
      expectTypeOf(state.prevData).toEqualTypeOf<string | undefined>();
      expectTypeOf(state.isReady).toEqualTypeOf<false>();
      expectTypeOf(state.isPending).toEqualTypeOf<boolean>();
    }

    if (state?.isPending) {
      expectTypeOf(state.prevData).toEqualTypeOf<string | undefined>();
      expectTypeOf(state.isReady).toEqualTypeOf<false>();
      expectTypeOf(state.isError).toEqualTypeOf<boolean>();
    }

    if (state?.isReady) {
      expectTypeOf(state.data).toEqualTypeOf<string>();
      expectTypeOf(state.isError).toEqualTypeOf<false>();
      expectTypeOf(state.isPending).toEqualTypeOf<false>();
    }

    if (state?.isPending && state.isError) {
      expectTypeOf(state.error).toEqualTypeOf<unknown>();
    }
  });
  it("func signature", () => {
    const $foo = createStore(1);
    const bar = asyncCombine(
      createStore(null),
      async (): Promise<string | number> => 1,
    );
    asyncCombine($foo, async (source) => {
      expectTypeOf(source).toEqualTypeOf<number>();
    });

    asyncCombine(bar, async (source) => {
      expectTypeOf(source).toEqualTypeOf<string | number>();
    });

    asyncCombine({ $foo, bar }, async (source, context, prevData) => {
      expectTypeOf(source).toEqualTypeOf<{
        foo: number;
        bar: string | number;
      }>();
      expectTypeOf(context).toEqualTypeOf<{
        prevSource?: { foo: number; bar: string | number };
        signal: AbortSignal;
      }>();
      expectTypeOf(prevData).toEqualTypeOf<unknown>();
      return 1;
    });

    asyncCombine(
      { $foo, bar },
      async (source, context, prevData?: string | number) => {
        expectTypeOf(source).toEqualTypeOf<{
          foo: number;
          bar: string | number;
        }>();
        expectTypeOf(context).toEqualTypeOf<{
          prevSource?: { foo: number; bar: string | number };
          signal: AbortSignal;
        }>();
        expectTypeOf(prevData).toEqualTypeOf<string | number | undefined>();
        return prevData;
      },
    );

    expectTypeOf(
      asyncCombine($foo, async (): Promise<string | undefined | void> => {
        return;
      }),
    ).toEqualTypeOf<AsyncCombine<string | undefined | void>>();

    expectTypeOf(
      asyncCombine({ $foo, bar }, async (source, context, prevData) => {
        expectTypeOf(source).toEqualTypeOf<{
          foo: number;
          bar: string | number;
        }>();
        expectTypeOf(context).toEqualTypeOf<{
          prevSource?: { foo: number; bar: string | number };
          signal: AbortSignal;
        }>();
        expectTypeOf(prevData).toEqualTypeOf<unknown>();
        return Math.random() ? 1 : prevData;
      }),
    ).toEqualTypeOf<AsyncCombine<unknown>>();
  });
  it("data", () => {
    const a = asyncCombine(createStore(1), async () => {
      return Math.random() > 0.5 ? 123 : "foo";
    });
    expectTypeOf(a).toEqualTypeOf<AsyncCombine<123 | "foo">>();

    expectTypeOf(
      asyncCombine(createStore(1), async () => {
        if (Math.random() > 0.5) return;
        return Math.random() > 0.5 ? 123 : "foo";
      }),
    ).toEqualTypeOf<AsyncCombine<123 | "foo" | undefined>>();
  });
  it("config", () => {
    asyncCombine(createStore(1), async () => "", {
      onError: createEvent().prepend((e) => {
        expectTypeOf(e).toEqualTypeOf<unknown>();
        return;
      }),
      sourceUpdateFilter: (prev, next) => {
        expectTypeOf(prev).toEqualTypeOf<number>();
        expectTypeOf(next).toEqualTypeOf<number>();
        return true;
      },
    });
  });

  describe("fromConfiguration", () => {
    it("config", () => {
      fromConfiguration({
        onError: createEvent().prepend((e) => {
          expectTypeOf(e).toEqualTypeOf<unknown>();
          return;
        }),
        sourceUpdateFilter: (prev, next) => {
          expectTypeOf(prev).toEqualTypeOf<unknown>();
          expectTypeOf(next).toEqualTypeOf<unknown>();
          return true;
        },
      });
    });
    it("creates configurated factories", () => {
      const ext1 = createExtension()(() => ({}));
      const c = fromConfiguration({ extension: ext1 });
      expectTypeOf(c).toEqualTypeOf<{
        asyncCombine: AsyncCombineCreator<{}, {}, unknown>;
        createExtension: ExtensionCreator<{}, {}, unknown>;
      }>();

      const ext2 = createExtension<{ context: { foo: string } }>()(() => ({
        extend: { bar: 123 },
      }));
      const c2 = fromConfiguration({ extension: ext2 });
      expectTypeOf(c2).toEqualTypeOf<{
        asyncCombine: AsyncCombineCreator<
          { foo: string },
          { bar: number },
          unknown
        >;
        createExtension: ExtensionCreator<
          { foo: string },
          { bar: number },
          unknown
        >;
      }>();
    });
    it("extra fields", () => {
      const ext1 = createExtension()(() => ({
        extend: { foo: 123 },
      }));

      const p = fromConfiguration({ extension: ext1 });

      expectTypeOf(
        p.asyncCombine(createStore(""), async () => {
          return;
        }).foo,
      ).toEqualTypeOf<number>();
    });
    it("data shape extends", () => {
      const ext1 = createExtension<{ data: { foo: string } }>()(() => ({}));
      const c1 = fromConfiguration({ extension: ext1 });

      c1.asyncCombine(
        createStore(1),
        // @ts-expect-error foo is missing
        async () => {
          return;
        },
      );
      c1.asyncCombine(
        createStore(1),
        // @ts-expect-error foo is missing
        async () => {
          return "";
        },
      );
      c1.asyncCombine(createStore(1), async () => {
        return { foo: "" };
      });

      const ext2 = c1.createExtension()(() => ({}));

      // @ts-expect-error foo is missing
      ext2(async () => {
        return;
      });
      // @ts-expect-error foo is missing
      ext2(async () => {
        return "";
      });
      ext2(async () => {
        return { foo: "" };
      });

      // @ts-expect-error foo is missing
      c1.createExtension<{ data: { bar: number } }>()(() => ({}));
      c1.createExtension<{ data: { foo: string; bar: number } }>()(() => ({}));
    });
    it("context configuration", () => {
      const ext = createExtension<{ context: { foo: string } }>()(() => ({}));
      const c = fromConfiguration({ extension: ext });
      const ext2 = c.createExtension<{ context: { bar: string } }>()(() => ({
        handler: (orig, context) => {
          expectTypeOf(context.foo).toEqualTypeOf<string>();
          expectTypeOf(context.prevData);
          return orig({ bar: "" });
        },
      }));
      c.asyncCombine(createStore(""), async (_, context) => {
        expectTypeOf(context.foo).toEqualTypeOf<string>();
        return "";
      });
      c.asyncCombine(
        createStore(""),
        ext2(async (_, context) => {
          expectTypeOf(context.foo).toEqualTypeOf<string>();
          expectTypeOf(context.bar).toEqualTypeOf<string>();
          return "";
        }),
      );
    });
    it("bound context cannot be overwriten", () => {
      const ext = createExtension<{ context: { foo: string } }>()(() => ({}));
      const c = fromConfiguration({ extension: ext });
      // @ts-expect-error
      c.createExtension<{ context: { foo: number } }>()(() => ({}));
    });
    it("bound extra cannot be overwriten", () => {
      const ext = createExtension()(() => ({
        extend: { foo: "bar" },
      }));
      const c = fromConfiguration({ extension: ext });
      c.createExtension()(() => ({
        // @ts-expect-error duplicated context prop "foo"
        extend: { foo: "baz" },
      }));
    });
    it("extension with bound context cannot be used with default combine", () => {
      const ext = createExtension<{ context: { foo: string } }>()(() => ({}));
      const c = fromConfiguration({ extension: ext });
      const ext2 = c.createExtension()(() => ({}));
      c.asyncCombine(
        createStore(""),
        ext2(async () => {
          return;
        }),
      );
      asyncCombine(
        createStore(""),
        // @ts-expect-error foo in context is missing
        ext2(async () => {
          return;
        }),
      );
    });
    it("extension with bound extra cannot be used with default combine", () => {
      const ext = createExtension()(() => ({
        extend: { foo: "bar" },
      }));
      const c = fromConfiguration({ extension: ext });
      const ext2 = c.createExtension()(() => ({}));
      c.asyncCombine(
        createStore(""),
        ext2(async () => {
          return;
        }),
      );
      asyncCombine(
        createStore(""),
        // @ts-expect-error foo in context is missing
        ext2(async () => {
          return;
        }),
      );
    });
    it("extension with bound context cannot be used as configuration", () => {
      const extWithContext = fromConfiguration({
        extension: createExtension<{ context: { foo: string } }>()(() => ({})),
      }).createExtension()(() => ({}));

      // @ts-expect-error bound context is not allowed
      fromConfiguration({ extension: extWithContext });
    });
    it("extension with bound extra cannot be used as configuration", () => {
      const extWithContext = fromConfiguration({
        extension: createExtension()(() => ({
          extend: { foo: "bar" },
        })),
      }).createExtension()(() => ({}));

      // @ts-expect-error bound context is not allowed
      fromConfiguration({ extension: extWithContext });
    });
  });

  describe("extensions", () => {
    it("extension config", () => {
      createExtension<{ context: { foo: string } }>()((extParams) => ({
        handler: (origFunc, { prevData, ...context }, params) => {
          expectTypeOf(extParams).toEqualTypeOf<
            ExtensionParams<unknown, void>
          >();
          origFunc({ foo: "" });
          // @ts-expect-error
          origFunc();
          // @ts-expect-error
          origFunc({ bar: "" });
          expectTypeOf(context.signal);
          expectTypeOf(prevData);
          expectTypeOf(params).toEqualTypeOf<void | undefined>();
          return origFunc({ foo: "" });
        },
      }));

      createExtension<{ data: { foo: string }; context: { foo: string } }>()(
        (extParams) => ({
          handler: (origFunc, { prevData, ...context }, params) => {
            expectTypeOf(extParams).toEqualTypeOf<
              ExtensionParams<{ foo: string }, void>
            >();
            origFunc({ foo: "" });
            // @ts-expect-error
            origFunc();
            // @ts-expect-error
            origFunc({ bar: "" });
            expectTypeOf(context).toEqualTypeOf<Pick<ContextShape, "signal">>();
            expectTypeOf(prevData);
            expectTypeOf(prevData?.foo).toEqualTypeOf<string | undefined>();
            expectTypeOf(params).toEqualTypeOf<void | undefined>();
            return origFunc({ foo: "" });
          },
        }),
      );

      createExtension<{ data: unknown; params: { foo: string } }>()(
        (extParams) => ({
          handler: (origFunc, { prevData, ...context }, params) => {
            expectTypeOf(extParams).toEqualTypeOf<
              ExtensionParams<unknown, { foo: string }>
            >();
            origFunc();
            // @ts-expect-error
            origFunc({ bar: "" });
            expectTypeOf(context).toEqualTypeOf<Pick<ContextShape, "signal">>();
            expectTypeOf(prevData);
            expectTypeOf(params).toEqualTypeOf<{ foo: string } | undefined>();
            return origFunc();
          },
        }),
      );
    });
    it("original function should extends shape", () => {
      const ext = createExtension<{ data: number }>()(() => ({}));

      expectTypeOf(
        asyncCombine(
          createStore(1),
          ext(async () => {
            return 1;
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<number>>();
      asyncCombine(
        createStore(1),
        // @ts-expect-error should be number
        ext(async () => {
          return "";
        }),
      );
    });
    it("source infers from combine", () => {
      const ext = createExtension()(() => ({}));

      asyncCombine(
        { $foo: createStore(1), $bar: createStore("") },
        ext(async (source) => {
          expectTypeOf(source).toEqualTypeOf<{ foo: number; bar: string }>();
          return;
        }),
      );
    });
    it("extended context available in original func", () => {
      const ext = createExtension<{ context: { foo: number } }>()(() => ({}));

      asyncCombine(
        createStore(""),
        ext(async (_, { foo }) => {
          expectTypeOf(foo).toEqualTypeOf<number>();
          return;
        }),
      );
    });
    it("configured context available in original func", () => {
      const c = fromConfiguration({
        extension: createExtension<{ context: { foo: number } }>()(() => ({})),
      });
      const ext = c.createExtension<{ context: { bar: string } }>()(() => ({}));

      c.asyncCombine(
        createStore(""),
        ext(async (_, { foo, bar }) => {
          expectTypeOf(foo).toEqualTypeOf<number>();
          expectTypeOf(bar).toEqualTypeOf<string>();
          return;
        }),
      );
    });
    it("extra available on combine", () => {
      const ext = createExtension()(() => ({
        extend: { foo: 123 },
      }));

      expectTypeOf(
        asyncCombine(
          createStore(""),
          ext(async () => {
            return;
          }),
        ).foo,
      ).toEqualTypeOf<number>();
    });
    it("configured extra available on combine", () => {
      const c = fromConfiguration({
        extension: createExtension()(() => ({
          extend: { foo: 123 },
        })),
      });
      const ext = c.createExtension()(() => ({
        extend: { bar: "456" },
      }));

      const com = c.asyncCombine(
        createStore(""),
        ext(async () => {
          return;
        }),
      );
      expectTypeOf(com.foo).toEqualTypeOf<number>();
      expectTypeOf(com.bar).toEqualTypeOf<string>();
    });
    it("original func should extends data shape", () => {
      const ext = createExtension<{ data: { foo: string } }>()(() => ({}));

      expectTypeOf(
        asyncCombine(
          createStore(""),
          ext(async () => {
            return { foo: "bar" };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ foo: string }>>();
      expectTypeOf(
        asyncCombine(
          createStore(""),
          ext(async () => {
            return { foo: "bar", baz: 123 };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ foo: string; baz: number }>>();
      expectTypeOf(
        asyncCombine(
          createStore(""),
          ext(async () => {
            return { foo: "" };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ foo: string }>>();
      asyncCombine(
        createStore(""),
        // @ts-expect-error should be { foo: string }
        ext(async () => {
          return "";
        }),
      );
    });
    it("data merge", () => {
      createExtension<{ data: unknown[] }>()(() => ({
        handler: async (orig) => {
          const result = await orig();

          expectTypeOf(result.mergeWithPrevData).toEqualTypeOf<() => void>();

          return result;
        },
      }));

      createExtension<{ data: { foo: string; arr: unknown[] } }>()(() => ({
        handler: async (orig) => {
          const result = await orig();

          expectTypeOf(result.mergeWithPrevData).toEqualTypeOf<
            (p: { arrayKey: "arr" }) => void
          >();

          return result;
        },
      }));
    });
  });

  describe("compose extention", () => {
    it("context extension cannot be overwriten", () => {
      const ext1 = createExtension<{ context: { foo: string } }>()(() => ({}));
      const ext2 = createExtension<{ context: { bar: string } }>()(() => ({}));

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );

      composeExtensions(
        ext1,
        ext2,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext2,
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
        ext2,
      );

      composeExtensions(
        ext1,
        ext2,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );

      composeExtensions(
        ext2,
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );
    });
    it("extra extension cannot be overwriten", () => {
      const ext1 = createExtension()(() => ({ extend: { foo: "string" } }));
      const ext2 = createExtension()(() => ({ extend: { bar: "string" } }));

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );

      composeExtensions(
        ext1,
        ext2,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext2,
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
      );

      composeExtensions(
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
        ext2,
      );

      composeExtensions(
        ext1,
        ext2,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );

      composeExtensions(
        ext2,
        ext1,
        // @ts-expect-error duplicated context prop "foo"
        ext1,
        ext2,
      );
    });
    it("data shape composition", () => {
      const ext1 = createExtension<{ data: { bar: string } }>()(() => ({}));
      const ext2 = createExtension()(() => ({}));
      const ext3 = createExtension<{ data: { foo: number } }>()(() => ({}));

      const composed1 = composeExtensions(ext1, ext3);

      expectTypeOf(
        asyncCombine(
          createStore(1),
          composed1(async () => {
            return { bar: "", foo: 1 };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ bar: string; foo: number }>>();
      asyncCombine(
        createStore(1),
        composed1(async () => {
          return { bar: "", foo: 1 };
        }),
      );
      asyncCombine(
        createStore(1),
        // @ts-expect-error should be { bar: string } & { foo: number }
        composed1(async () => {
          return { bar: "" };
        }),
      );

      const composed2 = composeExtensions(ext1, ext2, ext3);

      expectTypeOf(
        asyncCombine(
          createStore(1),
          composed2(async () => {
            return { bar: "", foo: 1 };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ bar: string; foo: number }>>();
      asyncCombine(
        createStore(1),
        composed2(async () => {
          return { bar: "", foo: 1 };
        }),
      );
      asyncCombine(
        createStore(1),
        // @ts-expect-error should be { bar: string } & { foo: number }
        composed2(async () => {
          return { bar: "" };
        }),
      );

      const composed3 = composeExtensions(ext1, ext2, ext3, ext2);

      expectTypeOf(
        asyncCombine(
          createStore(1),
          composed3(async () => {
            return { bar: "", foo: 1 };
          }),
        ),
      ).toEqualTypeOf<AsyncCombine<{ bar: string; foo: number }>>();
      asyncCombine(
        createStore(1),
        composed3(async () => {
          return { bar: "", foo: 1 };
        }),
      );
      asyncCombine(
        createStore(1),
        // @ts-expect-error should be { bar: string } & { foo: number }
        composed3(async () => {
          return { bar: "" };
        }),
      );
    });
    it("context composition", () => {
      const ext1 = createExtension<{ context: { foo: string } }>()(() => ({}));
      const ext2 = createExtension()(() => ({}));
      const ext3 = createExtension<{ context: { bar: number } }>()(() => ({}));

      const composed1 = composeExtensions(ext1, ext3);

      asyncCombine(
        createStore(1),
        composed1(async (_, context) => {
          expectTypeOf(context.bar).toEqualTypeOf<number>();
          expectTypeOf(context.foo).toEqualTypeOf<string>();
        }),
      );

      const composed2 = composeExtensions(ext1, ext2, ext3);

      asyncCombine(
        createStore(1),
        composed2(async (_, context) => {
          expectTypeOf(context.bar).toEqualTypeOf<number>();
          expectTypeOf(context.foo).toEqualTypeOf<string>();
        }),
      );

      const composed3 = composeExtensions(ext1, ext2, ext3, ext2);

      asyncCombine(
        createStore(1),
        composed3(async (_, context) => {
          expectTypeOf(context.bar).toEqualTypeOf<number>();
          expectTypeOf(context.foo).toEqualTypeOf<string>();
        }),
      );
    });
    it("extra composition", () => {
      const ext1 = createExtension()(() => ({ extend: { foo: "" } }));
      const ext2 = createExtension()(() => ({}));
      const ext3 = createExtension()(() => ({ extend: { bar: 1 } }));

      const composed1 = composeExtensions(ext1, ext3);

      const c1 = asyncCombine(
        createStore(1),
        composed1(async () => {
          return;
        }),
      );
      expectTypeOf(c1.foo).toEqualTypeOf<string>();
      expectTypeOf(c1.bar).toEqualTypeOf<number>();

      const composed2 = composeExtensions(ext1, ext2, ext3);

      const c2 = asyncCombine(
        createStore(1),
        composed2(async () => {
          return;
        }),
      );
      expectTypeOf(c2.foo).toEqualTypeOf<string>();
      expectTypeOf(c2.bar).toEqualTypeOf<number>();

      const composed3 = composeExtensions(ext1, ext2, ext3, ext2);

      const c3 = asyncCombine(
        createStore(1),
        composed3(async () => {
          return;
        }),
      );
      expectTypeOf(c3.foo).toEqualTypeOf<string>();
      expectTypeOf(c3.bar).toEqualTypeOf<number>();
    });
    it("configured extension composition", () => {
      const c1 = fromConfiguration({
        extension: createExtension()(() => ({ extend: { foo: 1 } })),
      });
      const c2 = fromConfiguration({
        extension: createExtension()(() => ({ extend: { bar: 1 } })),
      });

      c1.asyncCombine(
        createStore(1),
        composeExtensions(
          c1.createExtension()(() => ({})),
          c1.createExtension()(() => ({})),
          c1.createExtension()(() => ({})),
        )(async () => {
          return "";
        }),
      );
      c1.asyncCombine(
        createStore(1),
        // @ts-expect-error c2 not assignable to c1
        composeExtensions(
          c1.createExtension()(() => ({})),
          c2.createExtension()(() => ({})),
          c1.createExtension()(() => ({})),
        )(async () => {
          return "";
        }),
      );

      const c3 = fromConfiguration({
        extension: createExtension()(() => ({ extend: { foo: 1 } })),
      });
      const c4 = fromConfiguration({
        extension: createExtension()(() => ({ extend: { bar: 1 } })),
      });

      c3.asyncCombine(
        createStore(1),
        composeExtensions(
          c3.createExtension()(() => ({})),
          c3.createExtension()(() => ({})),
          c3.createExtension()(() => ({})),
        )(async () => {
          return "";
        }),
      );
      c3.asyncCombine(
        createStore(1),
        // @ts-expect-error c2 not assignable to c1
        composeExtensions(
          c3.createExtension()(() => ({})),
          c4.createExtension()(() => ({})),
          c3.createExtension()(() => ({})),
        )(async () => {
          return "";
        }),
      );
    });
  });
});
