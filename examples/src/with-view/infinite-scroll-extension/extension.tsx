import { createExtension } from "effector-async-combine";
import { useUnit } from "effector-react";
import type { FC, ReactElement } from "react";
import { useIntersectionObserver } from "usehooks-ts";

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

  const WithOffsetView: FC<{ 
    children: (params: {
      isFirstLoading: boolean,
      isLoadingMore: boolean,
      canLoadNext: boolean, 
      loadNext: () => void,
      triggerElement: React.JSX.Element | null
    }) => ReactElement | null
  }> = ({ children }) => {

    const units = useUnit({
      loadNext,
      canLoadNext: $canLoadNext,
      isFirstLoading: $isFirstLoading,
      isLoadingMore: $isLoadingMore,
    });

    const [ref] = useIntersectionObserver({
      onChange: (isIntersected) => {
        if (isIntersected && units.canLoadNext) {
          loadNext();
        }
      },
    });

    const triggerElement = units.canLoadNext ? <div  ref={ref} /> : null;

    return children({
      ...units,
      triggerElement
    });
  };

  return {
    extend: {
      loadNext,
      $canLoadNext,
      $isFirstLoading,
      $isLoadingMore,
      WithOffsetView
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
