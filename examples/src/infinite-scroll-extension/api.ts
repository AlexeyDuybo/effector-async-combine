import { createEffect } from "effector";

type Pokemon = { name: string; url: string };

export const loadPokemonsFx = createEffect<
  { offset: number; limit: number },
  { count: number; results: Pokemon[] }
>(async ({ offset, limit }) => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  return fetch(
    `https://pokeapi.co/api/v2/pokemon/?offset=${offset}&limit=${limit}`,
  ).then((r) => r.json());
});
