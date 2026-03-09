import { ExternalServiceError } from "./errors";

// ─── Types ───────────────────────────────────────────────────────

export interface WaitForConditionOptions {
	maxAttempts: number;
	intervalMs: number;
	backoffMultiplier: number;
	timeoutMs?: number;
}

export interface DurableContext {
	/**
	 * Wrap an idempotent step execution. In durable environments,
	 * this records the result and replays it on re-execution.
	 * Default: executes the function directly (passthrough).
	 */
	step: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;

	/**
	 * Sleep for the given duration. In durable environments,
	 * this uses a durable timer that survives process restarts.
	 * Default: setTimeout-based promise.
	 */
	sleep: (name: string, durationMs: number) => Promise<void>;

	/**
	 * Wait for a condition by polling. In durable environments,
	 * this might use waitForCallback or durable polling.
	 * Default: loop with setTimeout + backoff.
	 */
	waitForCondition: (
		name: string,
		checkFn: () => Promise<unknown>,
		options: WaitForConditionOptions,
	) => Promise<unknown>;
}

// ─── Default Implementation ──────────────────────────────────────

export function createDefaultDurableContext(): DurableContext {
	return {
		step: (_name, fn) => fn(),

		sleep: (_name, ms) => new Promise((r) => setTimeout(r, ms)),

		waitForCondition: async (_name, checkFn, opts) => {
			let delay = opts.intervalMs;
			const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : undefined;

			for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
				const result = await checkFn();
				if (result) return result;

				if (deadline && Date.now() + delay > deadline) {
					throw new ExternalServiceError(
						_name,
						"WAIT_CONDITION_TIMEOUT",
						`wait-for-condition '${_name}' timed out after ${opts.timeoutMs}ms`,
						undefined,
						undefined,
						false,
					);
				}

				await new Promise((r) => setTimeout(r, delay));
				delay *= opts.backoffMultiplier;
			}

			throw new ExternalServiceError(
				_name,
				"WAIT_CONDITION_MAX_ATTEMPTS",
				`wait-for-condition '${_name}' exceeded ${opts.maxAttempts} attempts`,
				undefined,
				undefined,
				false,
			);
		},
	};
}
