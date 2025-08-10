import { createExtension } from "../config";

export const withOffset = createExtension<{
  context: { offset: number };
  params: { loadMore: true };
  data: { items: unknown[]; hasMore: boolean };
}>()(({ $state, trigger }) => {
  const loadNext = trigger.prepend(() => ({ loadMore: true }));

  const $canLoadNext = $state.map(
    (state) => !!state?.isReady && state.data.hasMore,
  );

  const $isLoadingMore = $state.map(
    (state) => !!state?.isPending && !!state.params?.loadMore,
  );
  const $isFirstLoading = $state.map(
    (state) => !!state?.isPending && state.params === undefined,
  );

  return {
    extend: {
      loadNext,
      $canLoadNext,
      $isFirstLoading,
      $isLoadingMore,
    },
    handler: async (original, { prevData }, params) => {
      const offset = params?.loadMore ? (prevData?.items.length ?? 0) : 0;

      const result = await original({ offset });

      if (offset !== 0) {
        result.mergeWithPrevData({ arrayKey: "items" });
      }

      return result;
    },
  };
});
