import { asyncCombine } from "../../../../src";
import { combine, createEvent, createStore } from "effector";
import { createGate } from "effector-react";
import { loadPokemonsFx } from "./api";

const limit = 30;
export const pageGate = createGate();

export const nextPageClicked = createEvent();
export const prevPageClicked = createEvent();

export const $paginationPage = createStore(40)
  .on(nextPageClicked, (page) => page + 1)
  .on(prevPageClicked, (page) => Math.max(page - 1, 0))
  .reset(pageGate.close);

export const pokemonsAsync = asyncCombine(
  { $paginationPage, isPageOpen: pageGate.status },
  ({ paginationPage, isPageOpen }, { signal }) => {
    if (!isPageOpen) throw undefined;
    return loadPokemonsFx({ offset: paginationPage * limit, limit, signal });
  },
);

export const $showPrevPage = $paginationPage.map((page) => page > 0);
export const $showNextPage = combine(
  pokemonsAsync.$data,
  $paginationPage,
  (pokemons, paginationPage) => {
    if (!pokemons) return false;
    const totalPages = Math.ceil(pokemons.count / limit);

    return totalPages > paginationPage + 1;
  },
);
export const $pageIndicator = combine(
  pokemonsAsync.$data,
  $paginationPage,
  (pokemons, paginationPage) => {
    if (!pokemons) return null;
    const total = Math.ceil(pokemons.count / limit);

    return `${paginationPage + 1} / ${total}`;
  },
);
