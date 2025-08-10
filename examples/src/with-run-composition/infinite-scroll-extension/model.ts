import { asyncCombine, composeExtensions } from "effector-async-combine";
import { withOffset } from "./extension";
import { createGate } from "effector-react";
import { loadPokemons } from "./api";
import { withRun } from "../with-run";

const limit = 30;
export const pageGate = createGate();

export const pokemonsAsync = asyncCombine(
  pageGate.status,
  composeExtensions(
    withOffset,
    withRun,
  )(async (isPageOpen, { offset, run }) => {
    if (!isPageOpen) throw undefined;

    const pokemons = await run(loadPokemons({ offset, limit }));

    return {
      items: pokemons.results,
      hasMore: pokemons.results.length === limit,
    };
  }),
);
