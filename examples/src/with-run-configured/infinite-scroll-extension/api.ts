type Pokemon = { name: string; url: string };

export const loadPokemons = async ({
  offset,
  limit,
}: {
  offset: number;
  limit: number;
}): Promise<{ count: number; results: Pokemon[] }> => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  return fetch(
    `https://pokeapi.co/api/v2/pokemon/?offset=${offset}&limit=${limit}`,
  ).then((r) => r.json());
};
