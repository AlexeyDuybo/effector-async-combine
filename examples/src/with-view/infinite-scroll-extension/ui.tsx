import { useGate } from "effector-react";
import { pokemonsAsync, pageGate } from "./model";

export function InfiniteScrollExtansionPage() {
  useGate(pageGate);

  return (
    <pokemonsAsync.SuspenseView
      initialPendingFallback={() => <div>Loading...</div>}
      initialErrorFallback={() => <div>Ooops something went wrong</div>}    
    >
      {
        (view) => (
          <pokemonsAsync.WithOffsetView>
            {
              (ext) => (
                  <ul>
                    {view.data.items.map((pokemon) => (
                      <li key={pokemon.name}>{pokemon.name}</li>
                    ))}
                    {ext.triggerElement}
                    {ext.isLoadingMore && <div style={{ padding: 10 }}>Loading more...</div>}
                  </ul>
                )
            }
          </pokemonsAsync.WithOffsetView>
        )
      }
    </pokemonsAsync.SuspenseView>
  );
}
