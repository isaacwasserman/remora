import { isIP } from "node:net";
import { tool } from "ai";
import { type } from "arktype";

// ---------------------------------------------------------------------------
// Fetch tool safeguards
//
// NOTE: These checks run *before* fetch() makes its own connection. Because
// native fetch resolves DNS independently, a DNS-rebinding attack can
// theoretically slip between our validation and the actual connection. We
// mitigate this with a double-resolve check (see validateUrl), but the only
// airtight fix is network-level egress filtering (firewall / egress proxy).
// ---------------------------------------------------------------------------

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);
const ALLOWED_PORTS = new Set([80, 443]);

/** Maximum response body size in bytes. @see {@link MAX_RESPONSE_BYTES} */
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB

/** Request timeout in milliseconds. @see {@link REQUEST_TIMEOUT_MS} */
const REQUEST_TIMEOUT_MS = 15_000; // 15 s

/** Maximum number of fetch calls allowed per rate-limit window. @see {@link RATE_LIMIT_MAX} */
const RATE_LIMIT_MAX = 30;

/** Rate-limit window duration in milliseconds. @see {@link RATE_LIMIT_WINDOW_MS} */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 min

/** Delay between the two DNS lookups for rebinding detection. @see {@link DNS_RECHECK_DELAY_MS} */
const DNS_RECHECK_DELAY_MS = 50;

/**
 * Optional domain allowlist. When non-empty, only these domains (and their
 * subdomains) are reachable. Leave empty to allow any public domain.
 */
const DOMAIN_ALLOWLIST: string[] = [];

const rateLimitState = { timestamps: [] as number[] };

function checkRateLimit() {
  const now = Date.now();
  rateLimitState.timestamps = rateLimitState.timestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (rateLimitState.timestamps.length >= RATE_LIMIT_MAX) {
    throw new Error(
      `Rate limit exceeded: max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s`,
    );
  }
  rateLimitState.timestamps.push(now);
}

function isPrivateIP(ip: string): boolean {
  // IPv4
  if (ip.startsWith("0.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.match(/^172\.(1[6-9]|2\d|3[01])\./)) return true;
  // Carrier-grade NAT (100.64.0.0/10) — used by Tailscale, AWS VPC, etc.
  if (ip.match(/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./)) return true;
  // Benchmarking (198.18.0.0/15)
  if (ip.startsWith("198.18.") || ip.startsWith("198.19.")) return true;

  // IPv6 loopback & link-local & ULA
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc00:") || normalized.startsWith("fd"))
    return true;

  // IPv4-mapped IPv6 — extract the embedded IPv4 and recurse
  const v4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIP(v4Mapped[1]);

  return false;
}

function assertAllPublic(records: { address: string }[]) {
  for (const record of records) {
    if (isPrivateIP(record.address)) {
      throw new Error(
        "Requests to private/internal network addresses are not allowed",
      );
    }
  }
}

function matchesDomain(hostname: string, allowed: string): boolean {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

function resolvedAddresses(records: { address: string }[]): Set<string> {
  return new Set(records.map((r) => r.address));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function validateUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `Protocol "${parsed.protocol}" is not allowed. Use http: or https:`,
    );
  }

  // Port check — default ports (80/443) show as "" in URL.port
  const explicitPort = parsed.port ? Number.parseInt(parsed.port, 10) : null;
  const effectivePort =
    explicitPort ?? (parsed.protocol === "https:" ? 443 : 80);
  if (!ALLOWED_PORTS.has(effectivePort)) {
    throw new Error(
      `Port ${effectivePort} is not allowed. Only ports ${[...ALLOWED_PORTS].join(", ")} are permitted`,
    );
  }

  // Block raw IP addresses in the hostname — forces DNS-based validation
  if (isIP(parsed.hostname) !== 0) {
    throw new Error("Raw IP addresses are not allowed. Use a hostname instead");
  }

  // Domain allowlist
  if (
    DOMAIN_ALLOWLIST.length > 0 &&
    !DOMAIN_ALLOWLIST.some((d) => matchesDomain(parsed.hostname, d))
  ) {
    throw new Error(`Domain "${parsed.hostname}" is not in the allowlist`);
  }

  // First DNS resolution
  const records1 = await Bun.dns.lookup(parsed.hostname, {});
  if (records1.length === 0) {
    throw new Error(`DNS resolution failed for "${parsed.hostname}"`);
  }
  assertAllPublic(records1);

  // Second DNS resolution after a short delay to detect rebinding.
  // If the resolved IPs change between lookups, the record is unstable and
  // could be an attacker rotating between a public and private address.
  await sleep(DNS_RECHECK_DELAY_MS);
  const records2 = await Bun.dns.lookup(parsed.hostname, {});
  assertAllPublic(records2);

  const addrs1 = resolvedAddresses(records1);
  const addrs2 = resolvedAddresses(records2);
  if (addrs1.size !== addrs2.size || ![...addrs1].every((a) => addrs2.has(a))) {
    throw new Error(
      "DNS results changed between lookups — possible DNS rebinding attack",
    );
  }

  return parsed;
}

async function readLimitedBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  const contentLength = res.headers.get("content-length");

  if (
    contentLength &&
    Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES
  ) {
    throw new Error(
      `Response too large: ${contentLength} bytes exceeds ${MAX_RESPONSE_BYTES} byte limit`,
    );
  }

  // Stream-read with a byte cap
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      reader.cancel();
      throw new Error(
        `Response too large: exceeded ${MAX_RESPONSE_BYTES} byte limit`,
      );
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(combined);

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }
  return text;
}

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
  fetch: tool({
    description:
      "Make an HTTP request to a public URL. Supports GET, POST, PUT, PATCH, and DELETE methods with optional JSON body and custom headers.",
    inputSchema: type({
      url: "string",
      "method?": "'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'",
      "body?": "Record<string, unknown>",
      "headers?": "Record<string, string>",
    }),
    outputSchema: type({
      status: "number",
      statusText: "string",
      headers: "Record<string, string>",
      body: "unknown",
    }),
    execute: async ({ url, method, body, headers }) => {
      checkRateLimit();
      await validateUrl(url);

      const res = await fetch(url, {
        method: method ?? "GET",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // Redirects are blocked to prevent SSRF via open-redirect chains.
        // The caller can follow the Location header explicitly if needed.
        redirect: "error",
      });

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: await readLimitedBody(res),
      };
    },
  }),
};
