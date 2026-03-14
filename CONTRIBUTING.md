# Contributing

## How Publishing Works

Remora is published to npm as `@remoraflow/core`. There are two kinds of releases — **canary** (preview) and **stable** — and both are driven by **changeset files**. Here's how the whole thing works, from start to finish.

### Changesets: the starting point

A changeset is a small markdown file in the `.changeset/` directory that says "this package needs a version bump" and describes what changed. You create one by running:

```bash
bunx changeset
```

It asks you two things: what kind of bump (`patch`, `minor`, or `major`) and a short description. Then it creates a file like `.changeset/fuzzy-dogs-dance.md`:

```markdown
---
'@remoraflow/core': minor
---

Added a new step type for agent loops.
```

That file just sits there. It doesn't change `package.json` yet. It's a promise: "next time we release, bump the version and include this note."

Multiple changesets can pile up across different PRs. When it's time to release, they all get consumed together. If one says `minor` and another says `patch`, the highest wins — you get a minor bump.

Every PR requires a changeset to pass CI — even if it doesn't change any published code. For documentation-only changes, refactors, CI tweaks, or anything else that doesn't need a new release, add an **empty changeset**:

```bash
bunx changeset --empty
```

This creates a changeset file with no version bump. It tells CI "yes, I thought about it, and this PR doesn't need a release." The publish workflow will ignore it.

### What happens when you merge a PR

When a PR lands on `main`, the publish workflow runs automatically and does two things in parallel:

**1. Canary release** — A canary is a preview version published to npm under the `canary` tag. The workflow looks at the pending changeset files, applies them as a **snapshot** (so the version becomes something like `0.3.0-canary-20260310`), and publishes to npm. This does NOT change `package.json` on `main` — it's a throwaway version just so people can test the latest code with `npm install @remoraflow/core@canary`. If there are no pending changesets, the canary is skipped.

**2. Stable release PR** — The `changesets/action` checks if there are pending changesets. If so, it creates (or updates) a PR titled "chore: version packages". That PR contains the actual `package.json` version bump and changelog updates. When you merge *that* PR, the workflow runs again, sees there are no more changesets to consume, and publishes the new stable version to npm.

So the full lifecycle looks like this:

```
You write code
  → You run `bunx changeset` and commit the changeset file
  → Your PR merges to main
  → Canary auto-publishes (preview version, npm tag: canary)
  → A "version packages" PR is created/updated automatically
  → You merge the "version packages" PR
  → Stable release auto-publishes (real version, npm tag: latest)
```

### Manual releases

You can also trigger the publish workflow by hand — no PR or push needed. Two ways:

**From the GitHub Actions UI:** Go to Actions → Release → "Run workflow" → click the button.

**From the command line:**

```bash
gh workflow run Release
```

This runs the exact same canary + stable release flow described above. It's useful if a previous run failed and you want to retry, or if you want to publish without pushing a new commit.

### Quick reference

| Trigger | Canary published? | Stable published? |
|---|---|---|
| PR merges to `main` (with changesets) | Yes | No (creates version PR) |
| "Version packages" PR merges to `main` | No (changesets already consumed) | Yes |
| Manual workflow dispatch (with changesets) | Yes | No (creates version PR) |
| Manual workflow dispatch (no changesets) | No | No |
