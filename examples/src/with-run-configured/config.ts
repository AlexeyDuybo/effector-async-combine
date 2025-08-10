import { createEffect } from "effector";
import {
  createExtension as createExtensionOriginal,
  AbortError,
  fromConfiguration,
} from "effector-async-combine";

const runFx = createEffect(
  ({ signal, promise }: { signal: AbortSignal; promise: Promise<unknown> }) => {
    if (signal.aborted) {
      throw new AbortError();
    }

    return new Promise((res, rej) => {
      signal.addEventListener("abort", () => {
        rej(new AbortError());
      });

      promise.then(res, rej);
    });
  },
);

const withRun = createExtensionOriginal<{
  context: { run: <T>(promise: Promise<T>) => Promise<T> };
}>()(() => ({
  handler: (orig, { signal }) => {
    return orig({
      run: (promise) => runFx({ signal, promise }) as typeof promise,
    });
  },
}));

export const { asyncCombine, createExtension } = fromConfiguration({
  extension: withRun,
});
