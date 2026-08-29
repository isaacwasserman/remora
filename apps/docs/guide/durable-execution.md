# Durable Execution

::: code-group

```ts [Lambda Durable Functions]
import { withDurableExecution } from "@aws/durable-execution-sdk-js";
import { executeWorkflow } from "@remoraflow/core";
import {
    createDurableExecutionEngine,
    createLambdaDurableExecutionAdapter,
} from "@remoraflow/core/execution";
import { dogEvaluationWorkflow, dogToolSet, model } from "./my-app";

export const handler = withDurableExecution(
    async (event, durableContext) => {
        const executionEngine = createDurableExecutionEngine(
            createLambdaDurableExecutionAdapter(durableContext),
        );

        const { output } = await executeWorkflow({
            workflowDefinition: dogEvaluationWorkflow,
            tools: dogToolSet,
            model,
            executionOptions: { executionEngine },
        });

        return output;
    },
);
```

```ts [Temporal.io]
// workflow.ts — runs inside Temporal's sandboxed environment
import { proxyActivities, sleep, workflowInfo } from "@temporalio/workflow";
import type { ActivityOptions } from "@temporalio/workflow";
import { executeWorkflow } from "@remoraflow/core";
import {
    createDurableExecutionEngine,
    createTemporalDurableExecutionAdapter,
} from "@remoraflow/core/execution";
import { dogEvaluationWorkflow, dogToolSet, model } from "./my-app";

function createExecutionEngine() {
    const adapter = createTemporalDurableExecutionAdapter({
        workflowInfo,
        sleep,
        createActivities: (options) =>
            proxyActivities({
                startToCloseTimeout: options.startToCloseTimeout ?? "1 minute",
                retry: options.retry,
            } satisfies ActivityOptions),
    });
    return createDurableExecutionEngine(adapter);
}

export async function dogEvaluation() {
    const { output } = await executeWorkflow({
        workflowDefinition: dogEvaluationWorkflow,
        tools: dogToolSet,
        model,
        executionOptions: {
            executionEngine: createExecutionEngine(),
        },
    });

    return output;
}
```

```ts [Inngest]
import { Inngest, NonRetriableError } from "inngest";
import { serve } from "inngest/bun";
import { executeWorkflow } from "@remoraflow/core";
import {
    createDurableExecutionEngine,
    createInngestDurableExecutionAdapter,
} from "@remoraflow/core/execution";
import { dogEvaluationWorkflow, dogToolSet, model } from "./my-app";

const inngest = new Inngest({ id: "my-app" });

const dogEvaluation = inngest.createFunction(
    {
        id: "dog-evaluation",
        retries: 3,
        triggers: [{ event: "app/dog-evaluation.start" }],
    },
    async ({ step, runId }) => {
        const executionEngine = createDurableExecutionEngine(
            createInngestDurableExecutionAdapter({ runId, step, NonRetriableError }),
        );

        const { output } = await executeWorkflow({
            workflowDefinition: dogEvaluationWorkflow,
            tools: dogToolSet,
            model,
            executionOptions: { executionEngine },
        });

        return output;
    },
);

// Serve over HTTP for the Inngest dev server / cloud to invoke
const handler = serve({ client: inngest, functions: [dogEvaluation] });
```

```ts [Custom]
import { executeWorkflow } from "@remoraflow/core";
import {
    createDurableExecutionEngine,
    type DurableExecutionAdapter,
} from "@remoraflow/core/execution";
import { dogEvaluationWorkflow, dogToolSet, model } from "./my-app";

// Implement the three-method DurableExecutionAdapter interface.
// The host owns the journal, suspend/resume, and retry logic.
function createMyAdapter(hostContext: MyHostContext): DurableExecutionAdapter {
    return {
        getExecutionInfo() {
            return { runId: hostContext.runId };
        },

        step(stepName, fn, options) {
            // Delegate to the host's step primitive. The host decides
            // whether to execute fn or replay a previously recorded result.
            return hostContext.runStep(stepName, fn, {
                timeout: options?.timeoutSeconds,
                maxAttempts: options?.maxAttempts,
            });
        },

        async sleep(seconds) {
            // Delegate to the host's durable sleep. This may end the
            // current invocation entirely; the host resumes the workflow
            // after the duration elapses.
            await hostContext.durableSleep(seconds);
        },
    };
}

// Inside the host's handler:
export async function handler(hostContext: MyHostContext) {
    const executionEngine = createDurableExecutionEngine(
        createMyAdapter(hostContext),
    );

    const { output } = await executeWorkflow({
        workflowDefinition: dogEvaluationWorkflow,
        tools: dogToolSet,
        model,
        executionOptions: { executionEngine },
    });

    return output;
}
```

:::
