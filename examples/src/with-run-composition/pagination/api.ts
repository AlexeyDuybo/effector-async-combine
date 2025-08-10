type Pokemon = { name: string; url: string };

export const loadPokemons = async ({
  offset,
  limit,
  signal,
}: {
  offset: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<{ count: number; results: Pokemon[] }> => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  return fetch(
    `https://pokeapi.co/api/v2/pokemon/?offset=${offset}&limit=${limit}`,
    { signal },
  ).then((r) => r.json());
};
