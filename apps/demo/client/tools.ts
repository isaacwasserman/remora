import { tool } from "ai";
import { type } from "arktype";

export const DEMO_TOOLS = {
  "get-weather": tool({
    description: "Get the current weather for a given location.",
    inputSchema: type({
      location: "string",
      temperatureUnit: "'f' | 'c'",
    }),
    outputSchema: type({
      temperature: "number",
      condition: "string",
    }),
    execute: async ({ temperatureUnit }) => {
      let temperature = Math.floor(Math.random() * 30) + 1;
      if (temperatureUnit === "f") {
        temperature = (temperature * 9) / 5 + 32;
      }
      const conditions = ["Sunny", "Cloudy", "Rainy"];
      const condition =
        conditions[Math.floor(Math.random() * conditions.length)];
      return { temperature, condition };
    },
  }),
  "generate-random-number": tool({
    description: "Generate a random number between a given range.",
    inputSchema: type({
      min: "number",
      max: "number",
    }),
    outputSchema: type("number"),
    execute: async ({ min, max }) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
  }),
  "get-pokemon": tool({
    description:
      "Get details about a Pokémon by name or ID. Returns its name, types, height, weight, and base stats.",
    inputSchema: type({
      pokemon: "string",
    }),
    outputSchema: type({
      name: "string",
      types: "string[]",
      height: "number",
      weight: "number",
      stats: type({
        hp: "number",
        attack: "number",
        defense: "number",
        speed: "number",
      }),
    }),
    execute: async ({ pokemon }) => {
      const res = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(pokemon.toLowerCase())}`,
      );
      if (!res.ok) throw new Error(`Pokémon "${pokemon}" not found`);
      const data = await res.json();
      const stat = (name: string) =>
        data.stats.find(
          (s: { stat: { name: string }; base_stat: number }) =>
            s.stat.name === name,
        )?.base_stat ?? 0;
      return {
        name: data.name,
        types: data.types.map((t: { type: { name: string } }) => t.type.name),
        height: data.height,
        weight: data.weight,
        stats: {
          hp: stat("hp"),
          attack: stat("attack"),
          defense: stat("defense"),
          speed: stat("speed"),
        },
      };
    },
  }),
  "list-pokemon": tool({
    description:
      "List Pokémon with optional filters. Filter by type (e.g. 'fire') and/or generation (e.g. 1 for Kanto, 2 for Johto). Returns up to 20 matching Pokémon.",
    inputSchema: type({
      "type?": "string",
      "generation?": "number",
      "limit?": "number",
    }),
    outputSchema: type({
      count: "number",
      pokemon: "string[]",
    }),
    execute: async ({ type: typeName, generation, limit }) => {
      const max = Math.min(limit ?? 20, 20);

      // If filtering by type, use the type endpoint to get Pokémon of that type
      if (typeName) {
        const typeRes = await fetch(
          `https://pokeapi.co/api/v2/type/${encodeURIComponent(typeName.toLowerCase())}`,
        );
        if (!typeRes.ok) throw new Error(`Type "${typeName}" not found`);
        const typeData = await typeRes.json();
        let pokemonList: { name: string; url: string }[] = typeData.pokemon.map(
          (p: { pokemon: { name: string; url: string } }) => p.pokemon,
        );

        // If also filtering by generation, get the generation's species to intersect
        if (generation) {
          const genRes = await fetch(
            `https://pokeapi.co/api/v2/generation/${generation}`,
          );
          if (!genRes.ok) throw new Error(`Generation ${generation} not found`);
          const genData = await genRes.json();
          const genSpecies = new Set(
            genData.pokemon_species.map((s: { name: string }) => s.name),
          );
          pokemonList = pokemonList.filter((p) => genSpecies.has(p.name));
        }

        return {
          count: pokemonList.length,
          pokemon: pokemonList.slice(0, max).map((p) => p.name),
        };
      }

      // If filtering by generation only
      if (generation) {
        const genRes = await fetch(
          `https://pokeapi.co/api/v2/generation/${generation}`,
        );
        if (!genRes.ok) throw new Error(`Generation ${generation} not found`);
        const genData = await genRes.json();
        const species: { name: string }[] = genData.pokemon_species;
        return {
          count: species.length,
          pokemon: species.slice(0, max).map((s) => s.name),
        };
      }

      // No filters — just list from the main endpoint
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${max}`);
      if (!res.ok) throw new Error("Failed to fetch Pokémon list");
      const data = await res.json();
      return {
        count: data.count,
        pokemon: data.results.map((p: { name: string }) => p.name),
      };
    },
  }),
  "get-pokemon-type": tool({
    description:
      "Get type matchup information for a Pokémon type (e.g. fire, water). Returns what it's strong and weak against.",
    inputSchema: type({
      typeName: "string",
    }),
    outputSchema: type({
      name: "string",
      double_damage_to: "string[]",
      half_damage_to: "string[]",
      no_damage_to: "string[]",
      double_damage_from: "string[]",
      half_damage_from: "string[]",
      no_damage_from: "string[]",
    }),
    execute: async ({ typeName }) => {
      const res = await fetch(
        `https://pokeapi.co/api/v2/type/${encodeURIComponent(typeName.toLowerCase())}`,
      );
      if (!res.ok) throw new Error(`Type "${typeName}" not found`);
      const data = await res.json();
      const names = (arr: { name: string }[]) => arr.map((t) => t.name);
      const dr = data.damage_relations;
      return {
        name: data.name,
        double_damage_to: names(dr.double_damage_to),
        half_damage_to: names(dr.half_damage_to),
        no_damage_to: names(dr.no_damage_to),
        double_damage_from: names(dr.double_damage_from),
        half_damage_from: names(dr.half_damage_from),
        no_damage_from: names(dr.no_damage_from),
      };
    },
  }),
};
