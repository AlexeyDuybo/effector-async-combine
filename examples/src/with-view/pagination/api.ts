import { createEffect } from "effector";

type Pokemon = { name: string; url: string };

export const loadPokemonsFx = createEffect<
  { offset: number; limit: number; signal?: AbortSignal },
  { count: number; results: Pokemon[] }
>(async ({ offset, limit, signal }) => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  return fetch(
    `https://pokeapi.co/api/v2/pokemon/?offset=${offset}&limit=${limit}`,
    { signal },
  ).then((r) => r.json());
});
