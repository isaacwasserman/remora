import { describe, expect, test } from "bun:test";
import {
    DurationLimitExceededError,
    UnrecoverableExecutionError,
} from "./errors";
import { runStep } from "./run-step";

describe("unrecoverable errors", () => {
    test("a duration limit is unrecoverable", () => {
        expect(
            new DurationLimitExceededError("maxDurationSeconds", 60),
        ).toBeInstanceOf(UnrecoverableExecutionError);
    });

    test("names the limit and its value", () => {
        const error = new DurationLimitExceededError("maxExecutionSeconds", 30);
        expect(error.limit).toBe("maxExecutionSeconds");
        expect(error.limitSeconds).toBe(30);
        expect(error.message).toContain("maxExecutionSeconds");
        expect(error.message).toContain("30");
    });
});

describe("runStep retry policy", () => {
    test("retries an ordinary failure up to maxAttempts", async () => {
        let attempts = 0;
        const result = await runStep(
            async () => {
                attempts++;
                if (attempts < 3) throw new Error("flaky");
                return "ok";
            },
            { maxAttempts: 3, retryDelaySeconds: 0 },
        );
        expect(result).toBe("ok");
        expect(attempts).toBe(3);
    });

    test("does not retry an unrecoverable error", async () => {
        // Retrying would spend budget the run has already been told it is out
        // of, and could not succeed anyway.
        let attempts = 0;
        await expect(
            runStep(
                async () => {
                    attempts++;
                    throw new DurationLimitExceededError(
                        "maxDurationSeconds",
                        60,
                    );
                },
                { maxAttempts: 5, retryDelaySeconds: 0 },
            ),
        ).rejects.toBeInstanceOf(DurationLimitExceededError);
        expect(attempts).toBe(1);
    });

    test("an unrecoverable error outranks a shouldRetry that would allow it", async () => {
        let attempts = 0;
        await expect(
            runStep(
                async () => {
                    attempts++;
                    throw new UnrecoverableExecutionError("stop");
                },
                {
                    maxAttempts: 5,
                    retryDelaySeconds: 0,
                    shouldRetry: () => true,
                },
            ),
        ).rejects.toThrow("stop");
        expect(attempts).toBe(1);
    });
});
