import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../../types";
import { compileWorkflow } from "..";
import { enumerateSuggestions, getExpressionScope } from "./scope";

const fetchTool = tool({
  description: "Fetch a user by id",
  inputSchema: type({ id: "string" }),
  outputSchema: type({
    user: { name: "string", id: "string" },
    posts: type({ title: "string", views: "number" }).array(),
  }),
  execute: async () => ({}) as never,
});

const tools = { fetch: fetchTool };

const workflow: WorkflowDefinition = {
  initialStepId: "fetch",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      filters: {
        type: "object",
        properties: { since: { type: "string" } },
      },
    },
  },
  steps: [
    {
      id: "fetch",
      name: "Fetch",
      description: "load user",
      type: "tool-call",
      params: { toolName: "fetch", toolInput: {} },
      nextStepId: "loop",
    },
    {
      id: "loop",
      name: "Loop",
      description: "iterate posts",
      type: "for-each",
      params: {
        target: { type: "jmespath", expression: "fetch.posts" },
        itemName: "post",
        loopBodyStepId: "body",
      },
      nextStepId: "end",
    },
    {
      id: "body",
      name: "Body",
      description: "log the post",
      type: "tool-call",
      params: { toolName: "fetch", toolInput: {} },
    },
    { id: "end", name: "End", description: "", type: "end", params: {} },
  ],
};

async function compile() {
  const result = await compileWorkflow(workflow, { tools });
  if (!result.graph) throw new Error("expected graph");
  return result;
}

describe("getExpressionScope", () => {
  test("includes input + predecessors at body step", async () => {
    const { graph, constrainedToolSchemas: _ } = await compile();
    if (!graph) throw new Error("no graph");
    const compiledTools = await import("..").then((m) =>
      m.extractToolSchemas(tools),
    );
    const scope = getExpressionScope(workflow, graph, compiledTools, "body");
    const names = scope.map((s) => s.name).sort();
    expect(names).toContain("input");
    expect(names).toContain("fetch");
    expect(names).toContain("post");
  });

  test("loop var has item schema derived from for-each target", async () => {
    const { graph } = await compile();
    if (!graph) throw new Error("no graph");
    const compiledTools = await import("..").then((m) =>
      m.extractToolSchemas(tools),
    );
    const scope = getExpressionScope(workflow, graph, compiledTools, "body");
    const post = scope.find((s) => s.name === "post");
    expect(post).toBeDefined();
    expect(post?.kind).toBe("loopVar");
    const props = post?.schema?.properties as
      | Record<string, unknown>
      | undefined;
    expect(props && "title" in props).toBe(true);
    expect(props && "views" in props).toBe(true);
  });

  test("excludes loop var outside the loop body", async () => {
    const { graph } = await compile();
    if (!graph) throw new Error("no graph");
    const compiledTools = await import("..").then((m) =>
      m.extractToolSchemas(tools),
    );
    const scope = getExpressionScope(workflow, graph, compiledTools, "end");
    const names = scope.map((s) => s.name);
    expect(names).not.toContain("post");
  });
});

describe("enumerateSuggestions", () => {
  test("emits root, nested fields, and array projection paths", async () => {
    const { graph } = await compile();
    if (!graph) throw new Error("no graph");
    const compiledTools = await import("..").then((m) =>
      m.extractToolSchemas(tools),
    );
    const scope = getExpressionScope(workflow, graph, compiledTools, "body");
    const paths = enumerateSuggestions(scope).map((s) => s.path);
    expect(paths).toContain("input");
    expect(paths).toContain("input.query");
    expect(paths).toContain("input.filters.since");
    expect(paths).toContain("fetch");
    expect(paths).toContain("fetch.user.name");
    expect(paths).toContain("fetch.posts");
    expect(paths).toContain("fetch.posts[*]");
    expect(paths).toContain("fetch.posts[*].title");
    expect(paths).toContain("post");
    expect(paths).toContain("post.title");
  });
});
