import type { WorkflowDefinition } from "../types";

/**
 * Produces a deterministic hash string for a workflow definition.
 * Uses FNV-1a (32-bit) on the JSON-serialized workflow. This is intended
 * for change-detection / cache-invalidation, not cryptographic security.
 */
export function hashWorkflow(workflow: WorkflowDefinition): string {
  const str = JSON.stringify(workflow);
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
