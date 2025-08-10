import { useGate, useUnit } from "effector-react";
import { pokemonsAsync, pageGate } from "./model";
import { useIntersectionObserver } from "usehooks-ts";

export function InfiniteScrollExtansionPage() {
  useGate(pageGate);

  const pokemons = useUnit(pokemonsAsync.$data)?.items || [];
  const isFirstLoading = useUnit(pokemonsAsync.$isFirstLoading);
  const isLoadingMore = useUnit(pokemonsAsync.$isLoadingMore);
  const isError = useUnit(pokemonsAsync.$isError);
  const canLoadNext = useUnit(pokemonsAsync.$canLoadNext);
  const loadNext = useUnit(pokemonsAsync.loadNext);

  const [ref] = useIntersectionObserver({
    onChange: (isIntersected) => {
      if (isIntersected && canLoadNext) {
        loadNext();
      }
    },
  });

  if (isFirstLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Ooops something went wrong</div>;
  }

  return (
    <div>
      <ul>
        {pokemons.map((pokemon) => (
          <li key={pokemon.name}>{pokemon.name}</li>
        ))}
        {canLoadNext && <div ref={ref} />}
        {isLoadingMore && <div style={{ padding: 10 }}>Loading more...</div>}
      </ul>
    </div>
  );
}
