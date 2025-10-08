import { useGate, useUnit } from "effector-react";
import {
  pokemonsAsync,
  pageGate,
  prevPageClicked,
  nextPageClicked,
  $showNextPage,
  $showPrevPage,
  $pageIndicator,
} from "./model";

export function PaginationPage() {
  useGate(pageGate);

  const pokemons = useUnit(pokemonsAsync.$state);
  const pageIndicator = useUnit($pageIndicator);
  const showPrevPage = useUnit($showPrevPage);
  const showNextPage = useUnit($showNextPage);

  const onPrevPageClick = useUnit(prevPageClicked);
  const onNextPageClick = useUnit(nextPageClicked);

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {showPrevPage && <button onClick={onPrevPageClick}>Prev</button>}
        {showNextPage && <button onClick={onNextPageClick}>Next</button>}
        {pageIndicator}
      </div>
      {pokemons?.isReady && (
        <ul>
          {pokemons.data.results.map((pokemon) => (
            <li key={pokemon.name}>{pokemon.name}</li>
          ))}
        </ul>
      )}
      {pokemons?.isPending && <p>Loading....</p>}
      {pokemons?.isError && <p>Ooops something went wrong</p>}
    </div>
  );
}
