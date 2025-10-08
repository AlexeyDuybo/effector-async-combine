import {
  allSettled,
  createEffect,
  createStore,
  createWatch,
  EventCallable,
  fork,
} from "effector";
import { describe, expect, it, vitest } from "vitest";
import {
  asyncCombine,
  createExtension,
  composeExtensions,
  fromConfiguration,
} from ".";
import { CombineState } from "./types";
import { render } from '@testing-library/react';

const sleepFx = createEffect(async () => null);
const sleep = async () => {
  await sleepFx();
};

const withResolvers = () => {
  let resolve: (value?: any) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
};

const createState = <T,>(
  state: Partial<CombineState<T>> & { params?: unknown } = {},
): CombineState<T> => {
  if (state === undefined) return undefined;
  if (state.isReady)
    return {
      isReady: true,
      isError: false,
      isPending: false,
      data: state.data as T,
    };
  if (state.isError)
    return {
      isReady: false,
      isError: true,
      isPending: state.isPending ?? false,
      prevData: state.prevData,
      error: ("error" in state && state.error) || undefined,
    };
  if (state.isPending)
    return {
      isReady: false,
      isError: state.isError ?? false,
      isPending: true,
      prevData: state.prevData,
      // @ts-expect-error
      params: state.params,
    };
  return undefined;
};

describe("asyncCombine", () => {
  it("not initialized", ({ expect }) => {
    const $someStore = createStore("jj");
    const scope = fork();
    const combine = asyncCombine($someStore, async () => {
      return "some";
    });

    expect(scope.getState(combine.$state)).toBe(undefined);
    expect(scope.getState(combine.$isPending)).toBe(false);
    expect(scope.getState(combine.$isError)).toBe(false);
  });
  it("correc passes prev data", async () => {
    const $store = createStore(1);
    const spy = vitest.fn();
    const scope = fork();
    const result = vitest.fn();
    result.mockReturnValue(0);
    result.mockReturnValueOnce(1);
    result.mockReturnValueOnce(2);
    result.mockReturnValueOnce(undefined);
    result.mockReturnValueOnce(3);
    const combine = asyncCombine($store, async (_, __, prevData: any) => {
      spy(prevData);
      return result();
    });

    await allSettled($store, { scope, params: 2 });
    await allSettled($store, { scope, params: 3 });
    await allSettled(combine.trigger, { scope });
    await allSettled(combine.trigger, { scope });
    await allSettled(combine.changeData, { scope, params: 100 });
    await allSettled($store, { scope, params: 4 });
    await allSettled(combine.trigger, { scope });

    expect(spy).toHaveBeenCalledTimes(6);
    expect(spy).nthCalledWith(1, undefined);
    expect(spy).nthCalledWith(2, 1);
    expect(spy).nthCalledWith(3, 2);
    expect(spy).nthCalledWith(4, undefined);
    expect(spy).nthCalledWith(5, 100);
    expect(spy).nthCalledWith(6, 0);
  });
  it("correct passes prev source", async () => {
    const $store = createStore(1);
    const spy = vitest.fn();
    const scope = fork();
    const combine = asyncCombine($store, async (_, { prevSource }) => {
      spy(prevSource);
      return "bar";
    });

    await allSettled($store, { scope, params: 2 });
    await allSettled($store, { scope, params: 3 });
    await allSettled(combine.trigger, { scope });
    await allSettled(combine.trigger, { scope });
    await allSettled(combine.changeData, { scope, params: "x" });
    await allSettled($store, { scope, params: 4 });
    await allSettled(combine.trigger, { scope });

    expect(spy).toHaveBeenCalledTimes(6);
    expect(spy).nthCalledWith(1, undefined);
    expect(spy).nthCalledWith(2, 2);
    expect(spy).nthCalledWith(3, 3);
    expect(spy).nthCalledWith(4, 3);
    expect(spy).nthCalledWith(5, undefined);
    expect(spy).nthCalledWith(6, 4);
  });
  it("correct state computation with store in source", async () => {
    const scope = fork();
    const $source = createStore<any>("", { skipVoid: false });
    const result = vitest.fn();
    const sourceSpy = vitest.fn();
    const prevSourceSpy = vitest.fn();
    const prevDataSpy = vitest.fn();
    const stateSpy = vitest.fn();
    const dataSpy = vitest.fn();
    const combine = asyncCombine(
      $source,
      async (source, { prevSource }, prevData) => {
        prevSourceSpy(prevSource);
        prevDataSpy(prevData);
        sourceSpy(source);
        await sleep();
        return result();
      },
    );
    createWatch({ scope, unit: combine.$state, fn: stateSpy });
    createWatch({ scope, unit: combine.$data, fn: dataSpy });

    expect(stateSpy).not.toHaveBeenCalled();
    expect(prevSourceSpy).not.toHaveBeenCalled();
    expect(prevDataSpy).not.toHaveBeenCalled();
    expect(sourceSpy).not.toHaveBeenCalled();
    expect(dataSpy).not.toHaveBeenCalled();

    result.mockRejectedValueOnce(undefined);
    await allSettled($source, { scope, params: 1 });

    expect(stateSpy).toHaveBeenCalledTimes(2);
    expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));
    expect(stateSpy).nthCalledWith(2, createState(undefined));
    expect(dataSpy).toHaveBeenCalledTimes(0);

    expect(prevSourceSpy).toHaveBeenCalledTimes(1);
    expect(prevSourceSpy).nthCalledWith(1, undefined);

    expect(prevDataSpy).toHaveBeenCalledTimes(1);
    expect(prevDataSpy).nthCalledWith(1, undefined);

    expect(sourceSpy).toHaveBeenCalledTimes(1);
    expect(sourceSpy).nthCalledWith(1, 1);

    result.mockRejectedValueOnce(new Error("foo"));
    await allSettled($source, { scope, params: 2 });

    expect(stateSpy).toHaveBeenCalledTimes(4);
    expect(stateSpy).nthCalledWith(3, createState({ isPending: true }));
    expect(stateSpy).nthCalledWith(
      4,
      createState({ isError: true, error: new Error("foo") }),
    );
    expect(dataSpy).toHaveBeenCalledTimes(0);

    expect(prevSourceSpy).toHaveBeenCalledTimes(2);
    expect(prevSourceSpy).nthCalledWith(2, undefined);

    expect(prevDataSpy).toHaveBeenCalledTimes(2);
    expect(prevDataSpy).nthCalledWith(2, undefined);

    expect(sourceSpy).toHaveBeenCalledTimes(2);
    expect(sourceSpy).nthCalledWith(2, 2);

    result.mockReturnValueOnce("foo");
    await allSettled($source, { scope, params: 3 });

    expect(stateSpy).toHaveBeenCalledTimes(6);
    expect(stateSpy).nthCalledWith(
      5,
      createState({ isPending: true, isError: true, error: new Error("foo") }),
    );
    expect(stateSpy).nthCalledWith(
      6,
      createState({ isReady: true, data: "foo" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(1);
    expect(dataSpy).nthCalledWith(1, "foo");

    expect(prevSourceSpy).toHaveBeenCalledTimes(3);
    expect(prevSourceSpy).nthCalledWith(3, undefined);

    expect(prevDataSpy).toHaveBeenCalledTimes(3);
    expect(prevDataSpy).nthCalledWith(3, undefined);

    expect(sourceSpy).toHaveBeenCalledTimes(3);
    expect(sourceSpy).nthCalledWith(3, 3);

    result.mockRejectedValueOnce(new Error("bar"));
    await allSettled($source, { scope, params: 4 });

    expect(stateSpy).toHaveBeenCalledTimes(8);
    expect(stateSpy).nthCalledWith(
      7,
      createState({ isPending: true, prevData: "foo" }),
    );
    expect(stateSpy).nthCalledWith(
      8,
      createState({ isError: true, error: new Error("bar"), prevData: "foo" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(1);
    expect(dataSpy).nthCalledWith(1, "foo");

    expect(prevSourceSpy).toHaveBeenCalledTimes(4);
    expect(prevSourceSpy).nthCalledWith(4, 3);

    expect(prevDataSpy).toHaveBeenCalledTimes(4);
    expect(prevDataSpy).nthCalledWith(4, "foo");

    expect(sourceSpy).toHaveBeenCalledTimes(4);
    expect(sourceSpy).nthCalledWith(4, 4);

    result.mockReturnValueOnce("baz");
    await allSettled($source, { scope, params: 5 });

    expect(stateSpy).toHaveBeenCalledTimes(10);
    expect(stateSpy).nthCalledWith(
      9,
      createState({
        isPending: true,
        prevData: "foo",
        isError: true,
        error: new Error("bar"),
      }),
    );
    expect(stateSpy).nthCalledWith(
      10,
      createState({ isReady: true, data: "baz" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(2);
    expect(dataSpy).nthCalledWith(2, "baz");

    expect(prevSourceSpy).toHaveBeenCalledTimes(5);
    expect(prevSourceSpy).nthCalledWith(5, 3);

    expect(prevDataSpy).toHaveBeenCalledTimes(5);
    expect(prevDataSpy).nthCalledWith(5, "foo");

    expect(sourceSpy).toHaveBeenCalledTimes(5);
    expect(sourceSpy).nthCalledWith(5, 5);

    result.mockReturnValueOnce("baz");
    await allSettled(combine.trigger, { scope });

    expect(stateSpy).toHaveBeenCalledTimes(12);
    expect(stateSpy).nthCalledWith(
      11,
      createState({ isPending: true, prevData: "baz" }),
    );
    expect(stateSpy).nthCalledWith(
      12,
      createState({ isReady: true, data: "baz" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(2);
    expect(dataSpy).nthCalledWith(2, "baz");

    expect(prevSourceSpy).toHaveBeenCalledTimes(6);
    expect(prevSourceSpy).nthCalledWith(6, 5);

    expect(prevDataSpy).toHaveBeenCalledTimes(6);
    expect(prevDataSpy).nthCalledWith(6, "baz");

    expect(sourceSpy).toHaveBeenCalledTimes(6);
    expect(sourceSpy).nthCalledWith(6, 5);

    result.mockRejectedValueOnce(new Error("bar"));
    await allSettled($source, { scope, params: 6 });
    result.mockRejectedValueOnce(new Error("bar"));
    await allSettled(combine.trigger, { scope });

    expect(stateSpy).toHaveBeenCalledTimes(16);
    expect(stateSpy).nthCalledWith(
      15,
      createState({
        isPending: true,
        isError: true,
        error: new Error("bar"),
        prevData: "baz",
      }),
    );
    expect(stateSpy).nthCalledWith(
      16,
      createState({ isError: true, prevData: "baz", error: new Error("bar") }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(2);
    expect(dataSpy).nthCalledWith(2, "baz");

    expect(prevSourceSpy).toHaveBeenCalledTimes(8);
    expect(prevSourceSpy).nthCalledWith(8, 5);

    expect(prevDataSpy).toHaveBeenCalledTimes(8);
    expect(prevDataSpy).nthCalledWith(8, "baz");

    expect(sourceSpy).toHaveBeenCalledTimes(8);
    expect(sourceSpy).nthCalledWith(8, 6);

    await allSettled(combine.changeData, { scope, params: "foo" });
    expect(stateSpy).toHaveBeenCalledTimes(17);
    expect(stateSpy).nthCalledWith(
      17,
      createState({ isReady: true, data: "foo" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(3);
    expect(dataSpy).nthCalledWith(3, "foo");

    expect(prevSourceSpy).toHaveBeenCalledTimes(8);
    expect(prevDataSpy).toHaveBeenCalledTimes(8);
    expect(sourceSpy).toHaveBeenCalledTimes(8);

    result.mockReturnValueOnce("bar");
    allSettled($source, { scope, params: "baz" });
    allSettled($source, { scope, params: "foo" });
    await allSettled($source, { scope, params: "bar" });

    expect(stateSpy).toHaveBeenCalledTimes(19);
    expect(stateSpy).nthCalledWith(
      18,
      createState({ isPending: true, prevData: "foo" }),
    );
    expect(stateSpy).nthCalledWith(
      19,
      createState({ isReady: true, data: "bar" }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(4);
    expect(dataSpy).nthCalledWith(4, "bar");

    expect(prevSourceSpy).toHaveBeenCalledTimes(9);
    expect(prevSourceSpy).nthCalledWith(9, undefined);

    expect(prevDataSpy).toHaveBeenCalledTimes(9);
    expect(prevDataSpy).nthCalledWith(9, "foo");

    expect(sourceSpy).toHaveBeenCalledTimes(9);
    expect(sourceSpy).nthCalledWith(9, "bar");

    result.mockRejectedValueOnce(undefined);
    await allSettled(combine.trigger, { scope });

    result.mockReturnValueOnce(123);
    await allSettled(combine.trigger, { scope });

    expect(stateSpy).toHaveBeenCalledTimes(23);
    expect(stateSpy).nthCalledWith(22, createState({ isPending: true }));
    expect(stateSpy).nthCalledWith(
      23,
      createState({ isReady: true, data: 123 }),
    );

    expect(dataSpy).toHaveBeenCalledTimes(6);
    expect(dataSpy).nthCalledWith(5, undefined);
    expect(dataSpy).nthCalledWith(6, 123);

    expect(prevSourceSpy).toHaveBeenCalledTimes(11);
    expect(prevSourceSpy).nthCalledWith(11, undefined);

    expect(prevDataSpy).toHaveBeenCalledTimes(11);
    expect(prevDataSpy).nthCalledWith(10, "bar");
    expect(prevDataSpy).nthCalledWith(11, undefined);

    expect(sourceSpy).toHaveBeenCalledTimes(11);
    expect(sourceSpy).nthCalledWith(10, "bar");
    expect(sourceSpy).nthCalledWith(11, "bar");
  });
  it("pending state", async () => {
    const $someStore = createStore("jj");
    const p = withResolvers();
    const scope = fork();
    const combine = asyncCombine($someStore, () => p.promise);

    const pending = allSettled($someStore, { scope, params: "foo" });
    await sleep();

    expect(scope.getState(combine.$isPending)).toEqual(true);
    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isPending: true,
      }),
    );
    p.resolve();
    await pending;
  });
  it("pending state with prev data", async () => {
    const $someStore = createStore("jj");
    const p = withResolvers();
    const scope = fork();
    const handler = vitest.fn();
    const value = "bar";
    handler.mockResolvedValueOnce(value);
    handler.mockResolvedValueOnce(p.promise);
    const combine = asyncCombine($someStore, handler);
    await allSettled($someStore, { scope, params: "1" });

    const pending = allSettled($someStore, { scope, params: "2" });
    await sleep();

    expect(scope.getState(combine.$isPending)).toEqual(true);
    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isPending: true,
        prevData: value,
      }),
    );
    p.resolve();
    await pending;
  });
  it("error state", async () => {
    const $someStore = createStore("jj");
    const scope = fork();
    const combine = asyncCombine($someStore, () => {
      throw new Error("some error");
    });

    await allSettled($someStore, { scope, params: "foo" });

    expect(scope.getState(combine.$isError)).toEqual(true);
    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isError: true,
        error: new Error("some error"),
      }),
    );
  });
  it("error state with prev data", async () => {
    const $someStore = createStore("jj");
    const scope = fork();
    const handler = vitest.fn();
    const value = "bar";
    handler.mockResolvedValueOnce(value);
    handler.mockRejectedValueOnce(new Error("some error"));
    const combine = asyncCombine($someStore, handler);
    await allSettled($someStore, { scope, params: "1" });

    await allSettled($someStore, { scope, params: "2" });

    expect(scope.getState(combine.$isError)).toEqual(true);
    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isError: true,
        error: new Error("some error"),
        prevData: value,
      }),
    );
  });
  it("error & pending state", async () => {
    const $someStore = createStore("jj");
    const p = withResolvers();
    const scope = fork();
    const handler = vitest.fn();
    const value = "bar";
    handler.mockResolvedValueOnce(value);
    handler.mockRejectedValueOnce(new Error("some error"));
    handler.mockResolvedValueOnce(p.promise);
    const combine = asyncCombine($someStore, handler);
    await allSettled($someStore, { scope, params: "1" });
    await allSettled($someStore, { scope, params: "2" });

    const pending = allSettled($someStore, { scope, params: "3" });
    await sleep();

    expect(scope.getState(combine.$isPending)).toEqual(true);
    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isPending: true,
        isError: true,
        prevData: value,
        error: new Error("some error"),
      }),
    );
    p.resolve();
    await pending;
  });
  it("manual trigger", async () => {
    const scope = fork();
    const combine = asyncCombine(createStore(1), async () => "foo");

    await allSettled(combine.trigger, { scope });

    expect(scope.getState(combine.$state)).toEqual(
      createState({
        isReady: true,
        data: "foo",
      }),
    );
  });
  describe("source deep equality", () => {
    it("single store source", async () => {
      const scope = fork();
      const $source = createStore({ foo: { bar: 321 } });
      const stateSpy = vitest.fn();
      const callSpy = vitest.fn();
      const combine = asyncCombine($source, () => {
        callSpy();
        return 1;
      });
      await allSettled(combine.trigger, { scope });
      createWatch({ scope, unit: combine.$state, fn: stateSpy });

      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });

      expect(stateSpy).not.toHaveBeenCalled();
      expect(callSpy).toHaveBeenCalledTimes(1);
    });
    it("single combine source", async () => {
      const scope = fork();
      const stateSpy = vitest.fn();
      const callSpy = vitest.fn();
      const sourceCombine = asyncCombine(createStore(1), () => {
        return { foo: 123 };
      });
      const combine = asyncCombine(sourceCombine, () => {
        callSpy();
        return 1;
      });
      await allSettled(sourceCombine.trigger, { scope });
      createWatch({ scope, unit: combine.$state, fn: stateSpy });

      await allSettled(sourceCombine.changeData, {
        scope,
        params: { foo: 123 },
      });
      await allSettled(sourceCombine.changeData, {
        scope,
        params: { foo: 123 },
      });
      await allSettled(sourceCombine.changeData, {
        scope,
        params: { foo: 123 },
      });

      expect(stateSpy).toHaveBeenCalledTimes(0);
      expect(callSpy).toHaveBeenCalledTimes(1);
    });
    it("object store source", async () => {
      const scope = fork();
      const $source = createStore({ foo: { bar: 321 } });
      const stateSpy = vitest.fn();
      const callSpy = vitest.fn();
      const combine = asyncCombine({ $source }, () => {
        callSpy();
        return 1;
      });
      await allSettled(combine.trigger, { scope });
      createWatch({ scope, unit: combine.$state, fn: stateSpy });

      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });

      expect(stateSpy).not.toHaveBeenCalled();
      expect(callSpy).toHaveBeenCalledTimes(1);
    });
    it("object store and combine", async () => {
      const scope = fork();
      const $source = createStore({ foo: { bar: 321 } });
      const stateSpy = vitest.fn();
      const callSpy = vitest.fn();
      const sourceCombine = asyncCombine(createStore(1), () => {
        return { foo: 123 };
      });
      const combine = asyncCombine({ $source, sourceCombine }, () => {
        callSpy();
        return 1;
      });
      await allSettled(sourceCombine.trigger, { scope });
      createWatch({ scope, unit: combine.$state, fn: stateSpy });

      await allSettled(sourceCombine.changeData, {
        scope,
        params: { foo: 123 },
      });
      await allSettled($source, { scope, params: { foo: { bar: 321 } } });
      await allSettled(sourceCombine.changeData, {
        scope,
        params: { foo: 123 },
      });

      expect(stateSpy).toHaveBeenCalledTimes(6);
      expect(callSpy).toHaveBeenCalledTimes(1);
    });
  });
  describe("concurrent", () => {
    it("stores only latest result", async () => {
      const $someStore = createStore("jj");
      const p = withResolvers();
      const scope = fork();
      const handler = vitest.fn();
      handler.mockResolvedValueOnce(p.promise);
      handler.mockResolvedValueOnce("foo");
      const combine = asyncCombine($someStore, handler);

      allSettled($someStore, { scope, params: "1" });
      await sleep();
      await sleep();
      const pending = allSettled($someStore, { scope, params: "2" });
      p.resolve("bar");
      await pending;

      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: true,
          data: "foo",
        }),
      );
    });
    it("stores only latest error", async () => {
      const $someStore = createStore("jj");
      const p = withResolvers();
      const scope = fork();
      const handler = vitest.fn();
      handler.mockResolvedValueOnce(p.promise);
      handler.mockRejectedValueOnce(new Error("foo"));
      const combine = asyncCombine($someStore, handler);

      allSettled($someStore, { scope, params: "1" });
      await sleep();
      await sleep();
      const pending = allSettled($someStore, { scope, params: "2" });
      await sleep();
      p.resolve("bar");
      await pending;

      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: false,
          isError: true,
          error: new Error("foo"),
        }),
      );
    });
    it("stores only latest result with concurrent error", async () => {
      const $someStore = createStore("jj");
      const p = withResolvers();
      const scope = fork();
      const handler = vitest.fn();
      handler.mockResolvedValueOnce(p.promise);
      handler.mockResolvedValueOnce("foo");
      const combine = asyncCombine($someStore, handler);

      allSettled($someStore, { scope, params: "1" });
      await sleep();
      await sleep();
      const pending = allSettled($someStore, { scope, params: "2" });
      await sleep();
      p.reject("bar");
      await pending;

      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: true,
          data: "foo",
        }),
      );
    });
    it("signal aborts after function resolves", async ({ expect }) => {
      const $someStore = createStore("jj");
      const scope = fork();
      let signal: AbortSignal;
      const p = withResolvers();
      asyncCombine($someStore, async (_, context) => {
        signal = context.signal;
        return p.promise;
      });

      const pending = allSettled($someStore, { scope, params: "foo" });
      await sleep();
      await sleep();
      expect(signal!.aborted).toBe(false);

      p.resolve();
      await pending;
      expect(signal!.aborted).toBe(true);
    });
    it("signal aborts after function rejects", async ({ expect }) => {
      const $someStore = createStore("jj");
      const scope = fork();
      let signal: AbortSignal;
      const p = withResolvers();
      asyncCombine($someStore, async (_, context) => {
        signal = context.signal;
        return p.promise;
      });

      const pending = allSettled($someStore, { scope, params: "foo" });
      await sleep();
      await sleep();
      expect(signal!.aborted).toBe(false);

      p.reject();
      await pending;
      expect(signal!.aborted).toBe(true);
    });
    it("signal aborts if new execution started", async () => {
      const $someStore = createStore("jj");
      const scope = fork();
      let signal: AbortSignal;
      const p = withResolvers();
      const handler = vitest.fn();
      handler.mockImplementationOnce((context: any) => {
        signal = context.signal;
        return p.promise;
      });
      handler.mockImplementationOnce(() => "foo");
      asyncCombine($someStore, async (_, context) => {
        return handler(context);
      });

      allSettled($someStore, { scope, params: "foo" });
      await sleep();
      await sleep();
      expect(signal!.aborted).toBe(false);
      const pending = allSettled($someStore, { scope, params: "bar" });
      await sleep();

      expect(signal!.aborted).toBe(true);
      await pending;
    });
    it("stores only latest result with manual trigger", async () => {
      const $someStore = createStore("jj");
      const p = withResolvers();
      const scope = fork();
      const handler = vitest.fn();
      handler.mockResolvedValueOnce(p.promise);
      handler.mockResolvedValueOnce("foo");
      const combine = asyncCombine($someStore, handler);

      allSettled($someStore, { scope, params: "1" });
      await sleep();
      await sleep();
      const pending = allSettled(combine.trigger, { scope });
      await sleep();
      p.resolve("bar");
      await pending;

      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: true,
          data: "foo",
        }),
      );
    });
    it("signal aborts if new execution started with manual trigger", async () => {
      const $someStore = createStore("jj");
      const scope = fork();
      let signal: AbortSignal;
      const p = withResolvers();
      const handler = vitest.fn();
      handler.mockImplementationOnce((context: any) => {
        signal = context.signal;
        return p.promise;
      });
      handler.mockImplementationOnce(() => "foo");
      const combine = asyncCombine($someStore, async (_, context) => {
        return handler(context);
      });

      allSettled($someStore, { scope, params: "foo" });
      await sleep();
      await sleep();
      expect(signal!.aborted).toBe(false);
      const pending = allSettled(combine.trigger, { scope });
      await sleep();

      expect(signal!.aborted).toBe(true);
      await pending;
    });
    it("manual data change stop current execution", async () => {
      const p = withResolvers();
      const scope = fork();
      const combine = asyncCombine(createStore(""), () => p.promise);
      allSettled(combine.trigger, { scope });
      await sleep();

      const pending = await allSettled(combine.changeData, {
        scope,
        params: "foo",
      });
      await sleep();

      expect(scope.getState(combine.$isPending)).toEqual(false);
      await pending;
      p.resolve("bar");
      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: true,
          data: "foo",
        }),
      );
    });
  });
  describe("batching", () => {
    it("single source store batch", async () => {
      const scope = fork();
      const $source = createStore(1, { skipVoid: false });
      const callSpy = vitest.fn();
      const stateSpy = vitest.fn();
      const result = vitest.fn(() => 1);
      const combine = asyncCombine($source, async () => {
        callSpy();
        return result();
      });
      createWatch({ scope, fn: stateSpy, unit: combine.$state });

      allSettled($source, { scope, params: undefined });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      allSettled($source, { scope, params: 2 });
      allSettled($source, { scope, params: 3 });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      allSettled($source, { scope, params: 2 });
      allSettled($source, { scope, params: undefined });
      result.mockReturnValueOnce(2);
      await allSettled($source, { scope, params: 2 });

      expect(callSpy).toHaveBeenCalledTimes(1);
      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));

      expect(stateSpy).nthCalledWith(
        2,
        createState({ isReady: true, data: 2 }),
      );
    });
    it("single source combine batch", async () => {
      const scope = fork();
      const sourceCombine = asyncCombine(createStore(1), async () => {
        await sleep();
        return 1;
      });
      const callSpy = vitest.fn();
      const stateSpy = vitest.fn();
      const result = vitest.fn(() => 1);
      const combine = asyncCombine(sourceCombine, async () => {
        callSpy();
        return result();
      });
      createWatch({ scope, fn: stateSpy, unit: combine.$state });

      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(combine.trigger, { scope });
      allSettled(combine.trigger, { scope });
      result.mockReturnValueOnce(2);
      await allSettled(sourceCombine.trigger, { scope, params: undefined });

      expect(callSpy).toHaveBeenCalledTimes(1);
      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));

      expect(stateSpy).nthCalledWith(
        2,
        createState({ isReady: true, data: 2 }),
      );
    });
    it("single source combine batch", async () => {
      const scope = fork();
      const sourceCombine = asyncCombine(createStore(1), async () => {
        await sleep();
        return 1;
      });
      const callSpy = vitest.fn();
      const stateSpy = vitest.fn();
      const result = vitest.fn(() => 1);
      const $source = createStore(1);
      const combine = asyncCombine({ sourceCombine, $source }, async () => {
        callSpy();
        return result();
      });
      createWatch({ scope, fn: stateSpy, unit: combine.$state });

      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled($source, { scope, params: 3 });
      allSettled(combine.trigger, { scope });
      allSettled(sourceCombine.trigger, { scope, params: undefined });
      allSettled($source, { scope, params: 5 });
      allSettled(combine.trigger, { scope });
      allSettled($source, { scope, params: 10 });
      result.mockReturnValueOnce(2);
      await allSettled(sourceCombine.trigger, { scope, params: undefined });

      expect(callSpy).toHaveBeenCalledTimes(1);
      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));

      expect(stateSpy).nthCalledWith(
        2,
        createState({ isReady: true, data: 2 }),
      );
    });
    it("manual data change stops batching", async () => {
      const scope = fork();
      const combine = asyncCombine(createStore(1), async () => 1);

      allSettled(combine.trigger, { scope });
      await allSettled(combine.changeData, { scope, params: 100 });

      expect(scope.getState(combine.$state)).toEqual(
        createState({
          isReady: true,
          data: 100,
        }),
      );
    });
  });
  describe("dependencies on other combines", () => {
    it("single combine dependecy", async () => {
      const scope = fork();
      const sourceResult = vitest.fn();
      const sourceCombine = asyncCombine(createStore(""), async (store) => {
        await sleep();
        return sourceResult();
      });
      const sourceSpy = vitest.fn();
      const stateSpy = vitest.fn();
      const prevSourceSpy = vitest.fn();
      const prevDataSpy = vitest.fn();
      const result = vitest.fn();
      const combine = asyncCombine(
        sourceCombine,
        async (source, { prevSource }, prevData) => {
          await sleep();
          sourceSpy(source);
          prevSourceSpy(prevSource);
          prevDataSpy(prevData);
          return result();
        },
      );
      createWatch({ scope, unit: combine.$state, fn: stateSpy });

      expect(sourceSpy).not.toHaveBeenCalled();
      expect(prevSourceSpy).not.toHaveBeenCalled();
      expect(prevDataSpy).not.toHaveBeenCalled();
      expect(stateSpy).not.toHaveBeenCalled();

      sourceResult.mockRejectedValueOnce(undefined);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy).nthCalledWith(2, undefined);

      expect(sourceSpy).toHaveBeenCalledTimes(0);
      expect(prevSourceSpy).toHaveBeenCalledTimes(0);
      expect(prevDataSpy).toHaveBeenCalledTimes(0);

      sourceResult.mockRejectedValueOnce(new Error("foo"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(4);
      expect(stateSpy).nthCalledWith(3, createState({ isPending: true }));
      expect(stateSpy).nthCalledWith(
        4,
        createState({ isError: true, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(0);
      expect(prevSourceSpy).toHaveBeenCalledTimes(0);
      expect(prevDataSpy).toHaveBeenCalledTimes(0);

      sourceResult.mockReturnValueOnce("bar");
      result.mockReturnValueOnce(1);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(6);
      expect(stateSpy).nthCalledWith(
        5,
        createState({
          isPending: true,
          isError: true,
          error: new Error("foo"),
        }),
      );
      expect(stateSpy).nthCalledWith(
        6,
        createState({ isReady: true, data: 1 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(1);
      expect(sourceSpy).nthCalledWith(1, "bar");

      expect(prevSourceSpy).toHaveBeenCalledTimes(1);
      expect(prevSourceSpy).nthCalledWith(1, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(1);
      expect(prevDataSpy).nthCalledWith(1, undefined);

      sourceResult.mockRejectedValueOnce(new Error("foo"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(8);
      expect(stateSpy).nthCalledWith(
        7,
        createState({ isPending: true, isError: false, prevData: 1 }),
      );
      expect(stateSpy).nthCalledWith(
        8,
        createState({ isError: true, prevData: 1, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(1);
      expect(prevSourceSpy).toHaveBeenCalledTimes(1);
      expect(prevDataSpy).toHaveBeenCalledTimes(1);

      sourceResult.mockReturnValueOnce("foobar");
      result.mockReturnValueOnce(2);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(10);
      expect(stateSpy).nthCalledWith(
        9,
        createState({
          isPending: true,
          isError: true,
          prevData: 1,
          error: new Error("foo"),
        }),
      );
      expect(stateSpy).nthCalledWith(
        10,
        createState({ isReady: true, data: 2 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(2);
      expect(sourceSpy).nthCalledWith(2, "foobar");

      expect(prevSourceSpy).toHaveBeenCalledTimes(2);
      expect(prevSourceSpy).nthCalledWith(2, "bar");

      expect(prevDataSpy).toHaveBeenCalledTimes(2);
      expect(prevDataSpy).nthCalledWith(2, 1);

      sourceResult.mockReturnValueOnce("barfoo");
      result.mockReturnValueOnce(3);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(12);
      expect(stateSpy).nthCalledWith(
        11,
        createState({ isPending: true, isError: false, prevData: 2 }),
      );
      expect(stateSpy).nthCalledWith(
        12,
        createState({ isReady: true, data: 3 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(3);
      expect(sourceSpy).nthCalledWith(3, "barfoo");

      expect(prevSourceSpy).toHaveBeenCalledTimes(3);
      expect(prevSourceSpy).nthCalledWith(3, "foobar");

      expect(prevDataSpy).toHaveBeenCalledTimes(3);
      expect(prevDataSpy).nthCalledWith(3, 2);

      result.mockRejectedValueOnce(undefined);
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(14);
      expect(stateSpy).nthCalledWith(
        13,
        createState({ isPending: true, isError: false, prevData: 3 }),
      );
      expect(stateSpy).nthCalledWith(14, createState(undefined));

      expect(sourceSpy).toHaveBeenCalledTimes(4);
      expect(sourceSpy).nthCalledWith(4, "barfoo");

      expect(prevSourceSpy).toHaveBeenCalledTimes(4);
      expect(prevSourceSpy).nthCalledWith(4, "barfoo");

      expect(prevDataSpy).toHaveBeenCalledTimes(4);
      expect(prevDataSpy).nthCalledWith(4, 3);

      result.mockRejectedValueOnce(undefined);
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(16);
      expect(stateSpy).nthCalledWith(
        15,
        createState({ isPending: true, isError: false }),
      );
      expect(stateSpy).nthCalledWith(16, createState(undefined));

      expect(sourceSpy).toHaveBeenCalledTimes(5);
      expect(sourceSpy).nthCalledWith(5, "barfoo");

      expect(prevSourceSpy).toHaveBeenCalledTimes(5);
      expect(prevSourceSpy).nthCalledWith(5, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(5);
      expect(prevDataSpy).nthCalledWith(5, undefined);

      await allSettled(combine.changeData, { scope, params: 100 });

      expect(stateSpy).toHaveBeenCalledTimes(17);
      expect(stateSpy).nthCalledWith(
        17,
        createState({ isReady: true, data: 100 }),
      );

      result.mockRejectedValueOnce(new Error("foo"));
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(19);
      expect(stateSpy).nthCalledWith(
        18,
        createState({ isPending: true, isError: false, prevData: 100 }),
      );
      expect(stateSpy).nthCalledWith(
        19,
        createState({ isError: true, prevData: 100, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(6);
      expect(sourceSpy).nthCalledWith(6, "barfoo");

      expect(prevSourceSpy).toHaveBeenCalledTimes(6);
      expect(prevSourceSpy).nthCalledWith(6, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(6);
      expect(prevDataSpy).nthCalledWith(6, 100);

      await allSettled(combine.changeData, { scope, params: 200 });

      expect(stateSpy).toHaveBeenCalledTimes(20);
      expect(stateSpy).nthCalledWith(
        20,
        createState({ isReady: true, data: 200 }),
      );

      sourceResult.mockRejectedValueOnce(new Error("baz"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(22);
      expect(stateSpy).nthCalledWith(
        21,
        createState({ isPending: true, prevData: 200 }),
      );
      expect(stateSpy).nthCalledWith(
        22,
        createState({ isError: true, prevData: 200, error: new Error("baz") }),
      );

      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(22);

      await allSettled(combine.changeData, { scope, params: 300 });

      expect(stateSpy).toHaveBeenCalledTimes(23);
      expect(stateSpy).nthCalledWith(
        23,
        createState({ isReady: true, data: 300 }),
      );
      expect(sourceSpy).toHaveBeenCalledTimes(6);
      expect(prevSourceSpy).toHaveBeenCalledTimes(6);
      expect(prevDataSpy).toHaveBeenCalledTimes(6);
    });

    it("object combine dependecy", async () => {
      const scope = fork();
      const sourceResult = vitest.fn();
      const sourceCombine = asyncCombine(createStore(""), async (store) => {
        await sleep();
        return sourceResult();
      });
      const $source = createStore(321);
      const validSoureCombineValue = 123;
      const validSourceCombine = asyncCombine(
        createStore(1),
        async () => validSoureCombineValue,
      );
      const sourceSpy = vitest.fn();
      const stateSpy = vitest.fn();
      const prevSourceSpy = vitest.fn();
      const prevDataSpy = vitest.fn();
      const result = vitest.fn();
      const combine = asyncCombine(
        { sourceCombine, $source, validSourceCombine },
        async (source, { prevSource }, prevData) => {
          await sleep();
          sourceSpy(source);
          prevSourceSpy(prevSource);
          prevDataSpy(prevData);
          return result();
        },
      );
      await allSettled(validSourceCombine.trigger, { scope });
      createWatch({ scope, unit: combine.$state, fn: stateSpy });
      const getSourceValue = (
        val:
          | string
          | number
          | {
              validSourceCombine?: number;
              source?: number;
              sourceCombine: unknown;
            },
      ) => {
        if (val && typeof val === "object") {
          return {
            validSourceCombine: validSoureCombineValue,
            source: 321,
            ...val,
          };
        }
        return {
          validSourceCombine: validSoureCombineValue,
          source: 321,
          sourceCombine: val,
        };
      };

      expect(sourceSpy).not.toHaveBeenCalled();
      expect(prevSourceSpy).not.toHaveBeenCalled();
      expect(prevDataSpy).not.toHaveBeenCalled();
      expect(stateSpy).not.toHaveBeenCalled();

      sourceResult.mockRejectedValueOnce(undefined);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy).nthCalledWith(2, undefined);

      expect(sourceSpy).toHaveBeenCalledTimes(0);
      expect(prevSourceSpy).toHaveBeenCalledTimes(0);
      expect(prevDataSpy).toHaveBeenCalledTimes(0);

      sourceResult.mockRejectedValueOnce(new Error("foo"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(4);
      expect(stateSpy).nthCalledWith(3, createState({ isPending: true }));
      expect(stateSpy).nthCalledWith(
        4,
        createState({ isError: true, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(0);
      expect(prevSourceSpy).toHaveBeenCalledTimes(0);
      expect(prevDataSpy).toHaveBeenCalledTimes(0);

      sourceResult.mockReturnValueOnce("bar");
      result.mockReturnValueOnce(1);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(6);
      expect(stateSpy).nthCalledWith(
        5,
        createState({
          isPending: true,
          isError: true,
          error: new Error("foo"),
        }),
      );
      expect(stateSpy).nthCalledWith(
        6,
        createState({ isReady: true, data: 1 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(1);
      expect(sourceSpy).nthCalledWith(1, getSourceValue("bar"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(1);
      expect(prevSourceSpy).nthCalledWith(1, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(1);
      expect(prevDataSpy).nthCalledWith(1, undefined);

      sourceResult.mockRejectedValueOnce(new Error("foo"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(8);
      expect(stateSpy).nthCalledWith(
        7,
        createState({ isPending: true, isError: false, prevData: 1 }),
      );
      expect(stateSpy).nthCalledWith(
        8,
        createState({ isError: true, prevData: 1, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(1);
      expect(prevSourceSpy).toHaveBeenCalledTimes(1);
      expect(prevDataSpy).toHaveBeenCalledTimes(1);

      sourceResult.mockReturnValueOnce("foobar");
      result.mockReturnValueOnce(2);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(10);
      expect(stateSpy).nthCalledWith(
        9,
        createState({
          isPending: true,
          isError: true,
          prevData: 1,
          error: new Error("foo"),
        }),
      );
      expect(stateSpy).nthCalledWith(
        10,
        createState({ isReady: true, data: 2 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(2);
      expect(sourceSpy).nthCalledWith(2, getSourceValue("foobar"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(2);
      expect(prevSourceSpy).nthCalledWith(2, getSourceValue("bar"));

      expect(prevDataSpy).toHaveBeenCalledTimes(2);
      expect(prevDataSpy).nthCalledWith(2, 1);

      sourceResult.mockReturnValueOnce("barfoo");
      result.mockReturnValueOnce(3);
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(12);
      expect(stateSpy).nthCalledWith(
        11,
        createState({ isPending: true, isError: false, prevData: 2 }),
      );
      expect(stateSpy).nthCalledWith(
        12,
        createState({ isReady: true, data: 3 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(3);
      expect(sourceSpy).nthCalledWith(3, getSourceValue("barfoo"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(3);
      expect(prevSourceSpy).nthCalledWith(3, getSourceValue("foobar"));

      expect(prevDataSpy).toHaveBeenCalledTimes(3);
      expect(prevDataSpy).nthCalledWith(3, 2);

      result.mockRejectedValueOnce(undefined);
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(14);
      expect(stateSpy).nthCalledWith(
        13,
        createState({ isPending: true, isError: false, prevData: 3 }),
      );
      expect(stateSpy).nthCalledWith(14, createState(undefined));

      expect(sourceSpy).toHaveBeenCalledTimes(4);
      expect(sourceSpy).nthCalledWith(4, getSourceValue("barfoo"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(4);
      expect(prevSourceSpy).nthCalledWith(4, getSourceValue("barfoo"));

      expect(prevDataSpy).toHaveBeenCalledTimes(4);
      expect(prevDataSpy).nthCalledWith(4, 3);

      result.mockRejectedValueOnce(undefined);
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(16);
      expect(stateSpy).nthCalledWith(
        15,
        createState({ isPending: true, isError: false }),
      );
      expect(stateSpy).nthCalledWith(16, createState(undefined));

      expect(sourceSpy).toHaveBeenCalledTimes(5);
      expect(sourceSpy).nthCalledWith(5, getSourceValue("barfoo"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(5);
      expect(prevSourceSpy).nthCalledWith(5, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(5);
      expect(prevDataSpy).nthCalledWith(5, undefined);

      await allSettled(combine.changeData, { scope, params: 100 });

      expect(stateSpy).toHaveBeenCalledTimes(17);
      expect(stateSpy).nthCalledWith(
        17,
        createState({ isReady: true, data: 100 }),
      );

      result.mockRejectedValueOnce(new Error("foo"));
      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(19);
      expect(stateSpy).nthCalledWith(
        18,
        createState({ isPending: true, isError: false, prevData: 100 }),
      );
      expect(stateSpy).nthCalledWith(
        19,
        createState({ isError: true, prevData: 100, error: new Error("foo") }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(6);
      expect(sourceSpy).nthCalledWith(6, getSourceValue("barfoo"));

      expect(prevSourceSpy).toHaveBeenCalledTimes(6);
      expect(prevSourceSpy).nthCalledWith(6, undefined);

      expect(prevDataSpy).toHaveBeenCalledTimes(6);
      expect(prevDataSpy).nthCalledWith(6, 100);

      await allSettled(combine.changeData, { scope, params: 200 });

      expect(stateSpy).toHaveBeenCalledTimes(20);
      expect(stateSpy).nthCalledWith(
        20,
        createState({ isReady: true, data: 200 }),
      );

      sourceResult.mockRejectedValueOnce(new Error("baz"));
      await allSettled(sourceCombine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(22);
      expect(stateSpy).nthCalledWith(
        21,
        createState({ isPending: true, prevData: 200 }),
      );
      expect(stateSpy).nthCalledWith(
        22,
        createState({ isError: true, prevData: 200, error: new Error("baz") }),
      );

      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(24);

      await allSettled(combine.changeData, { scope, params: 300 });

      expect(stateSpy).toHaveBeenCalledTimes(25);
      expect(stateSpy).nthCalledWith(
        25,
        createState({ isReady: true, data: 300 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(6);
      expect(prevSourceSpy).toHaveBeenCalledTimes(6);
      expect(prevDataSpy).toHaveBeenCalledTimes(6);

      sourceResult.mockReturnValueOnce(400);
      result.mockReturnValueOnce(1000);
      result.mockReturnValueOnce(2000);
      await allSettled(sourceCombine.trigger, { scope });
      await allSettled($source, { scope, params: 3000 });

      expect(stateSpy).toHaveBeenCalledTimes(29);
      expect(stateSpy).nthCalledWith(
        26,
        createState({ isPending: true, isError: false, prevData: 300 }),
      );
      expect(stateSpy).nthCalledWith(
        27,
        createState({ isReady: true, data: 1000 }),
      );
      expect(stateSpy).nthCalledWith(
        28,
        createState({ isPending: true, prevData: 1000 }),
      );
      expect(stateSpy).nthCalledWith(
        29,
        createState({ isReady: true, data: 2000 }),
      );

      expect(sourceSpy).toHaveBeenCalledTimes(8);
      expect(sourceSpy).nthCalledWith(
        7,
        getSourceValue({ sourceCombine: 400 }),
      );
      expect(sourceSpy).nthCalledWith(
        8,
        getSourceValue({ source: 3000, sourceCombine: 400 }),
      );

      expect(prevSourceSpy).toHaveBeenCalledTimes(8);
      expect(prevSourceSpy).nthCalledWith(7, undefined);
      expect(prevSourceSpy).nthCalledWith(
        8,
        getSourceValue({ sourceCombine: 400 }),
      );

      expect(prevDataSpy).toHaveBeenCalledTimes(8);
      expect(prevDataSpy).nthCalledWith(7, 300);
      expect(prevDataSpy).nthCalledWith(8, 1000);
    });

    it("manual trigger does not start execution if single dependency combine not ready", async () => {
      const scope = fork();
      const p = withResolvers();
      const notInitedCombine = asyncCombine(createStore(1), async () => {
        if (10 > 1) {
          throw undefined;
        } else {
          return "foo";
        }
      });
      const errorCombine = asyncCombine(createStore(1), async () => {
        if (10 > 1) throw new Error();
        return "foo";
      });
      const pendingCombine = asyncCombine(
        createStore(1),
        async () => p.promise,
      );

      const spy1 = vitest.fn();
      const combine1 = asyncCombine(notInitedCombine, async () => spy1());
      const spy2 = vitest.fn();
      const combine2 = asyncCombine(errorCombine, async () => spy2());
      const spy3 = vitest.fn();
      const combine3 = asyncCombine(pendingCombine, async () => spy3());

      await allSettled(notInitedCombine.trigger, { scope });
      await allSettled(errorCombine.trigger, { scope });
      await allSettled(combine1.trigger, { scope });
      await allSettled(combine2.trigger, { scope });

      expect(spy1).toBeCalledTimes(0);
      expect(spy2).toBeCalledTimes(0);

      allSettled(pendingCombine.trigger, { scope });
      await sleep();
      const pending = allSettled(combine3.trigger, { scope });
      p.reject(undefined);
      await pending;

      expect(spy3).toBeCalledTimes(0);
    });
    it("manual trigger and source change does not start execution if object dependency combine not ready", async () => {
      const scope = fork();
      const $source = createStore(1);
      const p = withResolvers();
      const readyCombine = asyncCombine(createStore(1), async () => "foo");
      const notInitedCombine = asyncCombine(
        createStore(1),

        async () => {
          if (10 > 1) throw undefined;
          return "foo";
        },
      );
      const errorCombine = asyncCombine(createStore(1), async () => {
        if (10 > 1) throw new Error();
        return "foo";
      });
      const pendingCombine = asyncCombine(
        createStore(1),
        async () => p.promise,
      );

      const spy1 = vitest.fn();
      const combine1 = asyncCombine(
        { notInitedCombine, $source, readyCombine },
        async () => spy1(),
      );
      const spy2 = vitest.fn();
      const combine2 = asyncCombine(
        { errorCombine, $source, readyCombine },
        async () => spy2(),
      );
      const spy3 = vitest.fn();
      const combine3 = asyncCombine(
        { pendingCombine, $source, readyCombine },
        async () => spy3(),
      );

      await allSettled(readyCombine.trigger, { scope });
      await allSettled($source, { scope, params: 123 });
      await allSettled(notInitedCombine.trigger, { scope });
      await allSettled(errorCombine.trigger, { scope });
      await allSettled(combine1.trigger, { scope });
      await allSettled(combine2.trigger, { scope });

      expect(spy1).toBeCalledTimes(0);
      expect(spy2).toBeCalledTimes(0);

      allSettled(pendingCombine.trigger, { scope });
      await sleep();
      const pending = allSettled(combine3.trigger, { scope });
      p.reject(undefined);
      await pending;

      expect(spy3).toBeCalledTimes(0);
    });
  });
  describe("extension", () => {
    it("extension applying", async () => {
      const scope = fork();
      let trigger: EventCallable<number> | undefined;
      const stateSpy = vitest.fn();
      const contextSpy = vitest.fn();
      const paramsSpy = vitest.fn();
      const ext = createExtension<{
        context: { bar: string };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy });
        trigger = params.trigger;
        return {
          extend: {
            foo: 123,
          },
          handler: (orig, context, params) => {
            paramsSpy(params);
            return orig({ bar: "foo" });
          },
        };
      });

      const combine = asyncCombine(
        createStore(1),
        ext((_, context) => {
          contextSpy(context);
          return "";
        }),
      );

      expect(combine.foo).toEqual(123);
      expect(stateSpy).toHaveBeenCalledTimes(0);
      expect(contextSpy).toHaveBeenCalledTimes(0);

      await allSettled(combine.trigger, { scope });

      expect(stateSpy).toHaveBeenCalledTimes(2);
      expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(1);
      expect(contextSpy).nthCalledWith(
        1,
        expect.objectContaining({ bar: "foo" }),
      );

      expect(paramsSpy).nthCalledWith(1, undefined);

      await allSettled(trigger!, { scope, params: 123 });

      expect(stateSpy).toHaveBeenCalledTimes(4);
      expect(stateSpy).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: 123 }),
      );
      expect(stateSpy).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(2);
      expect(contextSpy).nthCalledWith(
        2,
        expect.objectContaining({ bar: "foo" }),
      );

      expect(paramsSpy).nthCalledWith(2, 123);
    });
    it("trigger batching", async () => {
      const scope = fork();
      let trigger: EventCallable<number> | undefined;
      const paramsSpy = vitest.fn();
      const ext = createExtension<{ params: number }>()((params) => {
        trigger = params.trigger;
        return {
          handler: (orig, context, params) => {
            paramsSpy(params);
            return orig();
          },
        };
      });
      asyncCombine(
        createStore(1),
        ext((_, context) => {
          return "";
        }),
      );

      allSettled(trigger!, { scope, params: 1 });
      allSettled(trigger!, { scope, params: 2 });
      allSettled(trigger!, { scope, params: 3 });
      allSettled(trigger!, { scope, params: 4 });
      await allSettled(trigger!, { scope, params: 5 });

      expect(paramsSpy).nthCalledWith(1, 5);
    });
    it("multiply extension applying", async () => {
      const scope = fork();
      let trigger1: EventCallable<number> | undefined;
      const stateSpy1 = vitest.fn();
      const paramsSpy1 = vitest.fn();
      const ext1 = createExtension<{
        context: { bar: string };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy1 });
        trigger1 = params.trigger;
        return {
          extend: {
            foo: 123,
          },
          handler: (orig, context, params) => {
            paramsSpy1(params);
            return orig({ bar: "foo" });
          },
        };
      });
      let trigger2: EventCallable<number> | undefined;
      const stateSpy2 = vitest.fn();
      const paramsSpy2 = vitest.fn();
      const ext2 = createExtension<{
        context: { baz: string };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy2 });
        trigger2 = params.trigger;
        return {
          extend: {
            bar: 321,
          },
          handler: (orig, context, params) => {
            paramsSpy2(params);
            return orig({ baz: "qux" });
          },
        };
      });
      const ext = composeExtensions(ext1, ext2);
      const contextSpy = vitest.fn();
      const combine = asyncCombine(
        createStore(1),
        ext((_, context) => {
          contextSpy(context);
          return "";
        }),
      );

      expect(combine.foo).toEqual(123);
      expect(combine.bar).toEqual(321);

      expect(stateSpy1).toHaveBeenCalledTimes(0);
      expect(stateSpy2).toHaveBeenCalledTimes(0);
      expect(contextSpy).toHaveBeenCalledTimes(0);

      await allSettled(combine.trigger, { scope });

      expect(stateSpy1).toHaveBeenCalledTimes(2);
      expect(stateSpy1).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy1).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(2);
      expect(stateSpy2).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy2).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(1);
      expect(contextSpy).nthCalledWith(
        1,
        expect.objectContaining({ bar: "foo", baz: "qux" }),
      );

      expect(paramsSpy1).nthCalledWith(1, undefined);
      expect(paramsSpy2).nthCalledWith(1, undefined);

      await allSettled(trigger1!, { scope, params: 123 });

      expect(stateSpy1).toHaveBeenCalledTimes(4);
      expect(stateSpy1).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: 123 }),
      );
      expect(stateSpy1).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(4);
      expect(stateSpy2).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy2).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(2);
      expect(contextSpy).nthCalledWith(
        2,
        expect.objectContaining({ bar: "foo", baz: "qux" }),
      );

      expect(paramsSpy1).nthCalledWith(2, 123);
      expect(paramsSpy2).nthCalledWith(2, undefined);

      await allSettled(trigger2!, { scope, params: 321 });

      expect(stateSpy1).toHaveBeenCalledTimes(6);
      expect(stateSpy1).nthCalledWith(
        5,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy1).nthCalledWith(
        6,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(6);
      expect(stateSpy2).nthCalledWith(
        5,
        createState({ isPending: true, prevData: "", params: 321 }),
      );
      expect(stateSpy2).nthCalledWith(
        6,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(3);
      expect(contextSpy).nthCalledWith(
        3,
        expect.objectContaining({ bar: "foo", baz: "qux" }),
      );

      expect(paramsSpy1).nthCalledWith(3, undefined);
      expect(paramsSpy2).nthCalledWith(3, 321);
    });
    it("multiply extension with applying with configuration", async () => {
      const scope = fork();
      let trigger0: EventCallable<number> | undefined;
      const stateSpy0 = vitest.fn();
      const paramsSpy0 = vitest.fn();
      const ext0 = createExtension<{
        context: { foo: boolean };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy0 });
        trigger0 = params.trigger;
        return {
          extend: {
            baz: 111,
          },
          handler: (orig, context, params) => {
            paramsSpy0(params);
            return orig({ foo: false });
          },
        };
      });
      const config = fromConfiguration({ extension: ext0 });
      let trigger1: EventCallable<number> | undefined;
      const stateSpy1 = vitest.fn();
      const paramsSpy1 = vitest.fn();
      const ext1 = config.createExtension<{
        context: { bar: string };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy1 });
        trigger1 = params.trigger;
        return {
          extend: {
            foo: 123,
          },
          handler: (orig, context, params) => {
            paramsSpy1(params);
            return orig({ bar: "foo" });
          },
        };
      });
      let trigger2: EventCallable<number> | undefined;
      const stateSpy2 = vitest.fn();
      const paramsSpy2 = vitest.fn();
      const ext2 = config.createExtension<{
        context: { baz: string };
        params: number;
      }>()((params) => {
        createWatch({ scope, unit: params.$state, fn: stateSpy2 });
        trigger2 = params.trigger;
        return {
          extend: {
            bar: 321,
          },
          handler: (orig, context, params) => {
            paramsSpy2(params);
            return orig({ baz: "qux" });
          },
        };
      });
      const ext = composeExtensions(ext1, ext2);
      const contextSpy = vitest.fn();
      const combine = config.asyncCombine(
        createStore(1),
        ext((_, context) => {
          contextSpy(context);
          return "";
        }),
      );

      expect(combine.baz).toEqual(111);
      expect(combine.foo).toEqual(123);
      expect(combine.bar).toEqual(321);

      expect(stateSpy0).toHaveBeenCalledTimes(0);
      expect(stateSpy1).toHaveBeenCalledTimes(0);
      expect(stateSpy2).toHaveBeenCalledTimes(0);
      expect(contextSpy).toHaveBeenCalledTimes(0);

      await allSettled(combine.trigger, { scope });

      expect(stateSpy0).toHaveBeenCalledTimes(2);
      expect(stateSpy0).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy0).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy1).toHaveBeenCalledTimes(2);
      expect(stateSpy1).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy1).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(2);
      expect(stateSpy2).nthCalledWith(1, createState({ isPending: true }));
      expect(stateSpy2).nthCalledWith(
        2,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(1);
      expect(contextSpy).nthCalledWith(
        1,
        expect.objectContaining({ bar: "foo", baz: "qux", foo: false }),
      );

      expect(paramsSpy0).nthCalledWith(1, undefined);
      expect(paramsSpy1).nthCalledWith(1, undefined);
      expect(paramsSpy2).nthCalledWith(1, undefined);

      await allSettled(trigger1!, { scope, params: 123 });

      expect(stateSpy0).toHaveBeenCalledTimes(4);
      expect(stateSpy0).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy0).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy1).toHaveBeenCalledTimes(4);
      expect(stateSpy1).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: 123 }),
      );
      expect(stateSpy1).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(4);
      expect(stateSpy2).nthCalledWith(
        3,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy2).nthCalledWith(
        4,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(2);
      expect(contextSpy).nthCalledWith(
        2,
        expect.objectContaining({ bar: "foo", baz: "qux", foo: false }),
      );

      expect(paramsSpy0).nthCalledWith(2, undefined);
      expect(paramsSpy1).nthCalledWith(2, 123);
      expect(paramsSpy2).nthCalledWith(2, undefined);

      await allSettled(trigger2!, { scope, params: 321 });

      expect(stateSpy0).toHaveBeenCalledTimes(6);
      expect(stateSpy0).nthCalledWith(
        5,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy0).nthCalledWith(
        6,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy1).toHaveBeenCalledTimes(6);
      expect(stateSpy1).nthCalledWith(
        5,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy1).nthCalledWith(
        6,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(6);
      expect(stateSpy2).nthCalledWith(
        5,
        createState({ isPending: true, prevData: "", params: 321 }),
      );
      expect(stateSpy2).nthCalledWith(
        6,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(3);
      expect(contextSpy).nthCalledWith(
        3,
        expect.objectContaining({ bar: "foo", baz: "qux", foo: false }),
      );

      expect(paramsSpy0).nthCalledWith(3, undefined);
      expect(paramsSpy1).nthCalledWith(3, undefined);
      expect(paramsSpy2).nthCalledWith(3, 321);

      await allSettled(trigger0!, { scope, params: 1000 });

      expect(stateSpy0).toHaveBeenCalledTimes(8);
      expect(stateSpy0).nthCalledWith(
        7,
        createState({ isPending: true, prevData: "", params: 1000 }),
      );
      expect(stateSpy0).nthCalledWith(
        8,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy1).toHaveBeenCalledTimes(8);
      expect(stateSpy1).nthCalledWith(
        7,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy1).nthCalledWith(
        8,
        createState({ isReady: true, data: "" }),
      );

      expect(stateSpy2).toHaveBeenCalledTimes(8);
      expect(stateSpy2).nthCalledWith(
        7,
        createState({ isPending: true, prevData: "", params: undefined }),
      );
      expect(stateSpy2).nthCalledWith(
        8,
        createState({ isReady: true, data: "" }),
      );

      expect(contextSpy).toHaveBeenCalledTimes(4);
      expect(contextSpy).nthCalledWith(
        4,
        expect.objectContaining({ bar: "foo", baz: "qux", foo: false }),
      );

      expect(paramsSpy0).nthCalledWith(4, 1000);
      expect(paramsSpy1).nthCalledWith(4, undefined);
      expect(paramsSpy2).nthCalledWith(4, undefined);
    });
    it("merge array data", async () => {
      const scope = fork();
      const ext = createExtension<{ data: unknown[] }>()((params) => {
        return {
          handler: async (orig, context, params) => {
            const result = await orig();

            result.mergeWithPrevData();

            return result;
          },
        };
      });
      const result = vitest.fn();
      result.mockReturnValueOnce([1, 2, 3]);
      result.mockReturnValueOnce([4, 5, 6]);
      const combine = asyncCombine(
        createStore(1),
        ext(() => {
          return result();
        }),
      );

      await allSettled(combine.trigger, { scope });
      await allSettled(combine.trigger, { scope });

      expect(scope.getState(combine.$state)).toEqual(
        createState({ isReady: true, data: [1, 2, 3, 4, 5, 6] }),
      );
    });
    it("merge arraykey data", async () => {
      const scope = fork();
      const ext = createExtension<{ data: { arr: unknown[] } }>()((params) => {
        return {
          handler: async (orig, context, params) => {
            const result = await orig();

            result.mergeWithPrevData({ arrayKey: "arr" });

            return result;
          },
        };
      });
      const result = vitest.fn();
      result.mockReturnValueOnce({ arr: [1, 2, 3] });
      result.mockReturnValueOnce({ arr: [4, 5, 6] });
      const combine = asyncCombine(
        createStore(1),
        ext(() => {
          return result();
        }),
      );

      await allSettled(combine.trigger, { scope });
      await allSettled(combine.trigger, { scope });

      expect(scope.getState(combine.$state)).toEqual(
        createState({ isReady: true, data: { arr: [1, 2, 3, 4, 5, 6] } }),
      );
    });
    it("multiply extension can merge array only once", async () => {
      const scope = fork();
      const ext1 = createExtension<{ data: { arr: unknown[] } }>()((params) => {
        return {
          handler: async (orig, context, params) => {
            const result = await orig();

            result.mergeWithPrevData({ arrayKey: "arr" });

            return result;
          },
        };
      });
      const ext2 = createExtension<{ data: { arr: unknown[] } }>()((params) => {
        return {
          handler: async (orig, context, params) => {
            const result = await orig();

            result.mergeWithPrevData({ arrayKey: "arr" });

            return result;
          },
        };
      });
      const result = vitest.fn();
      result.mockReturnValueOnce({ arr: [1, 2, 3] });
      result.mockReturnValueOnce({ arr: [4, 5, 6] });
      const combine = asyncCombine(
        createStore(1),
        composeExtensions(
          ext1,
          ext2,
        )(() => {
          return result();
        }),
      );

      await allSettled(combine.trigger, { scope });
      await allSettled(combine.trigger, { scope });

      expect(scope.getState(combine.$state)).toEqual(
        createState({ isReady: true, data: { arr: [1, 2, 3, 4, 5, 6] } }),
      );
    });
  });
  it("from configuration", async () => {
    const scope = fork();
    let trigger: EventCallable<number> | undefined;
    const stateSpy = vitest.fn();
    const contextSpy = vitest.fn();
    const paramsSpy = vitest.fn();
    const ext = createExtension<{
      context: { bar: string };
      params: number;
    }>()((params) => {
      createWatch({ scope, unit: params.$state, fn: stateSpy });
      trigger = params.trigger;
      return {
        extend: {
          foo: 123,
        },
        handler: (orig, context, params) => {
          paramsSpy(params);
          return orig({ bar: "foo" });
        },
      };
    });
    const config = fromConfiguration({ extension: ext });

    const combine = config.asyncCombine(createStore(1), (_, context) => {
      contextSpy(context);
      return "";
    });

    expect(combine.foo).toEqual(123);
    expect(stateSpy).toHaveBeenCalledTimes(0);
    expect(contextSpy).toHaveBeenCalledTimes(0);

    await allSettled(combine.trigger, { scope });

    expect(stateSpy).toHaveBeenCalledTimes(2);
    expect(stateSpy).nthCalledWith(1, createState({ isPending: true }));
    expect(stateSpy).nthCalledWith(2, createState({ isReady: true, data: "" }));

    expect(contextSpy).toHaveBeenCalledTimes(1);
    expect(contextSpy).nthCalledWith(
      1,
      expect.objectContaining({ bar: "foo" }),
    );

    expect(paramsSpy).nthCalledWith(1, undefined);

    await allSettled(trigger!, { scope, params: 123 });

    expect(stateSpy).toHaveBeenCalledTimes(4);
    expect(stateSpy).nthCalledWith(
      3,
      createState({ isPending: true, prevData: "", params: 123 }),
    );
    expect(stateSpy).nthCalledWith(4, createState({ isReady: true, data: "" }));

    expect(contextSpy).toHaveBeenCalledTimes(2);
    expect(contextSpy).nthCalledWith(
      2,
      expect.objectContaining({ bar: "foo" }),
    );

    expect(paramsSpy).nthCalledWith(2, 123);
  });
  describe("scope", () => {
    it("func executes in correct scope", async () => {
      const fx = createEffect<void, void>(async () => {});
      const scope = fork();
      const combine = asyncCombine(createStore(0), async () => {
        await fx();
        return 1;
      });
      const spy = vitest.fn();
      createWatch({ scope, fn: spy, unit: fx });

      await allSettled(combine.trigger, { scope });

      expect(spy).toHaveBeenCalledTimes(1);
    });
    it("func executes in correct scope with extension", async () => {
      const fx1 = createEffect<void, void>(async () => {});
      const fx2 = createEffect<void, void>(async () => {});
      const fx3 = createEffect<void, void>(async () => {});
      const scope = fork();
      const c = fromConfiguration({
        extension: createExtension()(() => ({
          handler: async (orig) => {
            await fx3();
            return orig();
          },
        })),
      });
      const ext = c.createExtension()(() => ({
        handler: async (orig) => {
          await fx2();
          return orig();
        },
      }));
      const combine = c.asyncCombine(
        createStore(0),
        ext(async () => {
          await fx1();
          return 1;
        }),
      );
      const spy1 = vitest.fn();
      const spy2 = vitest.fn();
      const spy3 = vitest.fn();
      createWatch({ scope, fn: spy1, unit: fx1 });
      createWatch({ scope, fn: spy2, unit: fx2 });
      createWatch({ scope, fn: spy3, unit: fx3 });

      await allSettled(combine.trigger, { scope });

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });
    it("async functions in extension", async () => {
      const fx1 = createEffect<void, void>(async () => {});
      const fx2 = createEffect<void, void>(async () => {});
      const scope = fork();
      const c = fromConfiguration({
        extension: createExtension()(() => ({
          handler: async (orig) => {
            await new Promise((res) => setTimeout(res));
            return orig();
          },
        })),
      });
      const ext = c.createExtension()(() => ({
        handler: async (orig) => {
          await fx2();
          return orig();
        },
      }));
      const combine = c.asyncCombine(
        createStore(0),
        ext(async () => {
          await fx1();
          return 1;
        }),
      );
      const spy1 = vitest.fn();
      const spy2 = vitest.fn();
      createWatch({ scope, fn: spy1, unit: fx1 });
      createWatch({ scope, fn: spy2, unit: fx2 });

      await allSettled(combine.trigger, { scope });

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });
  it('fn execution skip with same store value in source', async () => {
    const scope = fork();
    const $source = createStore<unknown>({});

    const fn = vitest.fn(() => 42);
    const async2 = asyncCombine(
      $source,
      fn
    );

    await allSettled($source, { scope, params: {} });
    await allSettled($source, { scope, params: {} });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(scope.getState(async2.$state)).toEqual(createState({ isReady: true, data: 42 }))
  })
  it('fn execution skip with same async combine value in source', async () => {
    const scope = fork();
    const async1 = asyncCombine(
      {},
      async () => {
        return 42;
      }
    )
    const fn = vitest.fn(() => 43);
    const async2 = asyncCombine(
      async1,
      fn
    );

    await allSettled(async1.trigger, { scope });
    await allSettled(async1.trigger, { scope });

    expect(scope.getState(async2.$state)).toEqual(createState({ isReady: true, data: 43 }))
  })
  it('correct state rollback when changed source equal to prev', async () => {
    const scope = fork();
    const asyncPromise1 = Promise.withResolvers();
    const async1 = asyncCombine(
      {},
      () => {
        return asyncPromise1.promise
      }
    );
    const async2Source = createStore<unknown>('');
    const async2 = asyncCombine(
      async2Source,
      () => {
        return 42
      }
    );

    const async3 = asyncCombine(
      { async1, async2 },
      ({ async2 }) => {
        return async2
      }
    );
    const duplicateSourceValue = {};

    allSettled(async1.trigger, { scope });
    await sleep();
    allSettled(async2Source, { scope, params: { ...duplicateSourceValue } });
    await sleep();
    await sleep();
    await sleep();

    expect(scope.getState(async1.$state)).toEqual(expect.objectContaining({ isPending: true }));
    expect(scope.getState(async2.$state)).toEqual(expect.objectContaining({ isReady: true }));
    expect(scope.getState(async3.$state)).toEqual(expect.objectContaining({ isPending: true }));

    asyncPromise1.resolve('async1');
    await sleep();
    const pendingState = allSettled(async2Source, { scope, params: { ...duplicateSourceValue } });
    await sleep();
    await sleep();
    await sleep();
    await sleep();
    await pendingState;

    expect(scope.getState(async1.$state)).toEqual(createState({ isReady: true, data: 'async1' }));
    expect(scope.getState(async2.$state)).toEqual(createState({ isReady: true, data: 42 }));
    expect(scope.getState(async3.$state)).toEqual(createState({ isReady: true, data: 42 }));
  })
});
