import type { WorkflowStep } from "../../schema";
import type { StepExecutor } from "../types";
import { agentLoopExecutor } from "./agent-loop";
import { endExecutor } from "./end";
import { extractDataExecutor } from "./extract-data";
import { forEachExecutor } from "./for-each";
import { llmPromptExecutor } from "./llm-prompt";
import { requestInterventionExecutor } from "./request-intervention";
import { sleepExecutor } from "./sleep";
import { startExecutor } from "./start";
import { switchCaseExecutor } from "./switch-case";
import { toolCallExecutor } from "./tool-call";
import { waitForConditionExecutor } from "./wait-for-condition";

export type StepExecutorMap = {
    [T in WorkflowStep["type"]]: StepExecutor<T>;
};

export const stepExecutors: StepExecutorMap = {
    "agent-loop": agentLoopExecutor,
    end: endExecutor,
    "extract-data": extractDataExecutor,
    "for-each": forEachExecutor,
    "llm-prompt": llmPromptExecutor,
    "request-intervention": requestInterventionExecutor,
    sleep: sleepExecutor,
    start: startExecutor,
    "switch-case": switchCaseExecutor,
    "tool-call": toolCallExecutor,
    "wait-for-condition": waitForConditionExecutor,
};
