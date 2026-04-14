/**
 * Default maximum token count for a fully rendered prompt (template + variables).
 * Applies at both compile time (template-only check) and execution time (rendered prompt check).
 */
export const MAXIMUM_PROMPT_LENGTH = 100_000;

/**
 * Default maximum token count for any single interpolated variable within a prompt.
 * Applied at execution time before measuring the full rendered prompt.
 */
export const MAXIMUM_PROMPT_VARIABLE_LENGTH = 5_000;
