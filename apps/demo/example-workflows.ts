import type { WorkflowDefinition } from "@remoraflow/core";

/**
 * Workflow 1: "Pokémon Type Scout"
 *
 * Covers: inputSchema, outputSchema, start, end, tool-call, for-each,
 *         switch-case, literal, jmespath, template expressions
 *
 * Takes a type name as input, lists Pokémon of that type, looks up each one,
 * then branches to fetch type matchup data.
 */
export const POKEMON_TYPE_SCOUT: WorkflowDefinition = {
  initialStepId: "start",
  inputSchema: {
    type: "object",
    properties: {
      typeName: {
        type: "string",
        description:
          "Pokémon type to scout (e.g. fire, water, grass, electric)",
      },
    },
    required: ["typeName"],
  },
  outputSchema: {
    type: "object",
    properties: {
      team: {
        type: "array",
        description: "Detailed stats for each Pokémon of the chosen type",
      },
      matchups: {
        type: "object",
        description: "Type effectiveness matchup data",
      },
    },
  },
  steps: [
    {
      id: "start",
      name: "Start",
      description: "Begin the type scouting workflow",
      type: "start",
      nextStepId: "list_type",
    },
    {
      id: "list_type",
      name: "List Pokémon by Type",
      description: "Fetch a list of Pokémon matching the input type",
      type: "tool-call",
      nextStepId: "lookup_each",
      params: {
        toolName: "list-pokemon",
        toolInput: {
          type: { type: "jmespath", expression: "input.typeName" },
          limit: { type: "literal", value: 3 },
        },
      },
    },
    {
      id: "lookup_each",
      name: "Lookup Each Pokémon",
      description: "Fetch detailed stats for every Pokémon in the list",
      type: "for-each",
      nextStepId: "check_type",
      params: {
        target: { type: "jmespath", expression: "list_type.pokemon" },
        itemName: "name",
        loopBodyStepId: "fetch_one",
      },
    },
    {
      id: "fetch_one",
      name: "Fetch Pokémon Details",
      description: "Get full details for a single Pokémon by name",
      type: "tool-call",
      params: {
        toolName: "get-pokemon",
        toolInput: {
          pokemon: { type: "jmespath", expression: "name" },
        },
      },
    },
    {
      id: "check_type",
      name: "Branch on Type",
      description:
        "Route to the correct type matchup lookup based on input type",
      type: "switch-case",
      nextStepId: "done",
      params: {
        switchOn: { type: "jmespath", expression: "input.typeName" },
        cases: [
          {
            value: { type: "literal", value: "fire" },
            branchBodyStepId: "fire_matchup",
          },
          {
            value: { type: "literal", value: "water" },
            branchBodyStepId: "water_matchup",
          },
          {
            value: { type: "default" },
            branchBodyStepId: "other_matchup",
          },
        ],
      },
    },
    {
      id: "fire_matchup",
      name: "Fire Matchups",
      description: "Get type effectiveness for fire",
      type: "tool-call",
      params: {
        toolName: "get-pokemon-type",
        toolInput: {
          typeName: { type: "literal", value: "fire" },
        },
      },
    },
    {
      id: "water_matchup",
      name: "Water Matchups",
      description: "Get type effectiveness for water",
      type: "tool-call",
      params: {
        toolName: "get-pokemon-type",
        toolInput: {
          typeName: { type: "literal", value: "water" },
        },
      },
    },
    {
      id: "other_matchup",
      name: "Type Matchups",
      description: "Get type effectiveness for the given type",
      type: "tool-call",
      params: {
        toolName: "get-pokemon-type",
        toolInput: {
          typeName: { type: "jmespath", expression: "input.typeName" },
        },
      },
    },
    {
      id: "done",
      name: "Done",
      description: "Output the team roster and type matchup data",
      type: "end",
      params: {
        output: {
          type: "jmespath",
          expression: "{team: lookup_each, matchups: check_type}",
        },
      },
    },
  ],
};

/**
 * Workflow 2: "Pokémon Analyst" (requires LLM)
 *
 * Covers: llm-prompt, extract-data, agent-loop, tool-call, template expressions
 *
 * Fetches a Pokémon and its type data, then uses an LLM to analyze it,
 * extracts structured insights, and runs an agent loop for strategy.
 */
export const POKEMON_ANALYST: WorkflowDefinition = {
  initialStepId: "start",
  inputSchema: {
    type: "object",
    properties: {
      pokemon: {
        type: "string",
        description: "Name of the Pokémon to analyze (e.g. charizard)",
      },
    },
    required: ["pokemon"],
  },
  outputSchema: {
    type: "object",
    properties: {
      pokemon: { type: "string", description: "Name of the analyzed Pokémon" },
      rating: { type: "number", description: "Competitive rating from 1-10" },
      role: {
        type: "string",
        description: "Ideal battle role (e.g. sweeper, wall, support)",
      },
      insights: {
        type: "object",
        description:
          "Structured competitive insights extracted from the analysis",
      },
      strategy: {
        type: "object",
        description: "Final battle strategy and teammate recommendations",
      },
    },
  },
  steps: [
    {
      id: "start",
      name: "Start",
      description: "Begin the analysis workflow",
      type: "start",
      nextStepId: "fetch_pokemon",
    },
    {
      id: "fetch_pokemon",
      name: "Fetch Pokémon",
      description: "Get the target Pokémon's stats and details",
      type: "tool-call",
      nextStepId: "fetch_type",
      params: {
        toolName: "get-pokemon",
        toolInput: {
          pokemon: { type: "jmespath", expression: "input.pokemon" },
        },
      },
    },
    {
      id: "fetch_type",
      name: "Fetch Primary Type",
      description: "Look up type matchups for the Pokémon's primary type",
      type: "tool-call",
      nextStepId: "describe",
      params: {
        toolName: "get-pokemon-type",
        toolInput: {
          typeName: {
            type: "jmespath",
            expression: "fetch_pokemon.types[0]",
          },
        },
      },
    },
    {
      id: "describe",
      name: "LLM Analysis",
      description: "Use an LLM to analyze the Pokémon's competitive viability",
      type: "llm-prompt",
      nextStepId: "extract_insights",
      params: {
        prompt:
          "Analyze the Pokémon ${fetch_pokemon.name} (types: ${fetch_pokemon.types[0]}). Stats: HP ${fetch_pokemon.stats.hp}, Attack ${fetch_pokemon.stats.attack}, Defense ${fetch_pokemon.stats.defense}, Speed ${fetch_pokemon.stats.speed}. Its primary type is strong against: ${fetch_type.double_damage_to[0]}, ${fetch_type.double_damage_to[1]}. Weak against: ${fetch_type.double_damage_from[0]}, ${fetch_type.double_damage_from[1]}. Give a brief competitive analysis covering strengths, weaknesses, and ideal role.",
        outputFormat: {
          type: "object",
          properties: {
            analysis: {
              type: "string",
              description: "Competitive analysis paragraph",
            },
            rating: {
              type: "number",
              description: "Competitive rating from 1-10",
            },
            role: {
              type: "string",
              description: "Ideal battle role (e.g. sweeper, wall, support)",
            },
          },
          required: ["analysis", "rating", "role"],
        },
      },
    },
    {
      id: "extract_insights",
      name: "Extract Insights",
      description:
        "Extract structured strengths and weaknesses from the analysis",
      type: "extract-data",
      nextStepId: "strategize",
      params: {
        sourceData: { type: "jmespath", expression: "describe.analysis" },
        outputFormat: {
          type: "object",
          properties: {
            strengths: {
              type: "array",
              items: { type: "string" },
              description: "Key competitive strengths",
            },
            weaknesses: {
              type: "array",
              items: { type: "string" },
              description: "Key competitive weaknesses",
            },
            tier: {
              type: "string",
              description: "Competitive tier (e.g. OU, UU, RU, NU, Ubers)",
            },
          },
          required: ["strengths", "weaknesses", "tier"],
        },
      },
    },
    {
      id: "strategize",
      name: "Agent: Build Strategy",
      description:
        "Autonomous agent creates a battle strategy using available tools",
      type: "agent-loop",
      nextStepId: "done",
      params: {
        instructions:
          "Create a competitive battle strategy for ${fetch_pokemon.name}. It is rated ${describe.rating}/10 as a ${describe.role}. Use the available tools to research its counters and teammates. Suggest a moveset strategy and two good teammates.",
        tools: ["get-pokemon", "get-pokemon-type", "list-pokemon"],
        outputFormat: {
          type: "object",
          properties: {
            strategy: {
              type: "string",
              description: "Overall battle strategy summary",
            },
            teammates: {
              type: "array",
              items: { type: "string" },
              description: "Recommended teammate Pokémon names",
            },
          },
          required: ["strategy", "teammates"],
        },
        maxSteps: { type: "literal", value: 5 },
      },
    },
    {
      id: "done",
      name: "Done",
      description: "Output the complete analysis",
      type: "end",
      params: {
        output: {
          type: "jmespath",
          expression:
            "{pokemon: fetch_pokemon.name, rating: describe.rating, role: describe.role, insights: extract_insights, strategy: strategize}",
        },
      },
    },
  ],
};

/**
 * Workflow 3: "Pokémon Gacha"
 *
 * Covers: sleep, wait-for-condition, tool-call with template expressions,
 *         generate-random-number tool
 *
 * Simulates a gacha pull: spins (sleep), then flips a coin repeatedly
 * (wait-for-condition with 50% chance per attempt since 0 is falsy),
 * and on success reveals a random Pokémon prize.
 */
export const POKEMON_GACHA: WorkflowDefinition = {
  initialStepId: "start",
  steps: [
    {
      id: "start",
      name: "Start",
      description: "Begin the gacha pull",
      type: "start",
      nextStepId: "spin",
    },
    {
      id: "spin",
      name: "Spin the Wheel",
      description: "Dramatic pause while the gacha wheel spins",
      type: "sleep",
      nextStepId: "pull",
      params: {
        durationMs: { type: "literal", value: 1500 },
      },
    },
    {
      id: "pull",
      name: "Gacha Pull",
      description:
        "Flip a coin each attempt — 0 is a miss (falsy), 1 is a hit (truthy). Retries until success.",
      type: "wait-for-condition",
      nextStepId: "pick_id",
      params: {
        conditionStepId: "coin_flip",
        condition: {
          type: "jmespath",
          expression: "coin_flip",
        },
        maxAttempts: { type: "literal", value: 5 },
        intervalMs: { type: "literal", value: 500 },
      },
    },
    {
      id: "coin_flip",
      name: "Flip Coin",
      description: "50/50 chance: 0 = miss, 1 = hit",
      type: "tool-call",
      params: {
        toolName: "generate-random-number",
        toolInput: {
          min: { type: "literal", value: 0 },
          max: { type: "literal", value: 1 },
        },
      },
    },
    {
      id: "pick_id",
      name: "Pick Prize ID",
      description: "Generate a random Pokémon ID for the prize",
      type: "tool-call",
      nextStepId: "reveal",
      params: {
        toolName: "generate-random-number",
        toolInput: {
          min: { type: "literal", value: 1 },
          max: { type: "literal", value: 151 },
        },
      },
    },
    {
      id: "reveal",
      name: "Reveal Prize",
      description: "Look up the prize Pokémon",
      type: "tool-call",
      nextStepId: "done",
      params: {
        toolName: "get-pokemon",
        toolInput: {
          pokemon: {
            type: "template",
            template: "${pick_id}",
          },
        },
      },
    },
    {
      id: "done",
      name: "Done",
      description: "Output the prize Pokémon",
      type: "end",
      params: {
        output: {
          type: "jmespath",
          expression: "reveal",
        },
      },
    },
  ],
};

export const EXAMPLE_WORKFLOWS = [
  {
    id: "type-scout",
    name: "Pokémon Type Scout",
    description:
      "Input-driven workflow with branching, loops, and type matchups",
    workflow: POKEMON_TYPE_SCOUT,
  },
  {
    id: "analyst",
    name: "Pokémon Analyst",
    description: "LLM-powered analysis with extract-data and agent loop",
    requiresLLM: true,
    workflow: POKEMON_ANALYST,
  },
  {
    id: "gacha",
    name: "Pokémon Gacha",
    description: "Gacha pull with sleep and wait-for-condition coin flip",
    workflow: POKEMON_GACHA,
  },
] as const;
