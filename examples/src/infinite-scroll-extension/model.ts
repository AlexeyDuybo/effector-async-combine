import { asyncCombine } from "../../../src";
import { withOffset } from "./extension";
import { createGate } from "effector-react";
import { loadPokemonsFx } from "./api";

const limit = 30;
export const pageGate = createGate();

export const pokemonsAsync = asyncCombine(
  pageGate.status,
  withOffset(async (isPageOpen, { offset }) => {
    if (!isPageOpen) throw undefined;

    const pokemons = await loadPokemonsFx({ offset, limit });

    return {
      items: pokemons.results,
      hasMore: pokemons.results.length === limit,
    };
  }),
);
