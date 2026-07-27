import type { StepPath } from "./types";

/**
 * Separator for {@link StepPath} segments. Step ids cannot contain it (see the
 * id pattern in `schema.ts`) and the executor's other segments are digits or
 * fixed literals, so a joined path is an unambiguous encoding of its segments.
 */
const STEP_PATH_SEPARATOR = ".";

export function joinStepPath(stepPath: StepPath): string {
    return stepPath.join(STEP_PATH_SEPARATOR);
}

/**
 * Namespace for keys the runtime owns rather than the workflow author. Step ids
 * cannot begin with `__` (see the id pattern in `schema.ts`), so a reserved key
 * can never collide with a path built from authored ids.
 */
export const RESERVED_SEGMENT = "__remoraflow";

/** Key for one of the runtime's own values, e.g. `loop.0.__remoraflow.wakeAt`. */
export function reservedStepPath(stepPath: StepPath, name: string): string {
    return joinStepPath([...stepPath, RESERVED_SEGMENT, name]);
}
