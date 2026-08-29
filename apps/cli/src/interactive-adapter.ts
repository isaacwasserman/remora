import { createInterface } from "node:readline/promises";
import type {
    InterventionResponse,
    UserInterventionAdapter,
} from "@remoraflow/core";

async function promptUser(prompt: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await rl.question(prompt);
    rl.close();
    return answer.trim();
}

export function createInteractiveAdapter(): UserInterventionAdapter {
    const responses = new Map<string, InterventionResponse>();

    return {
        async requestIntervention({ interventionRequestId, request }) {
            console.log("\n\x1b[36m--- Intervention Required ---\x1b[0m");
            console.log(`\x1b[1m${request.question}\x1b[0m`);

            if (request.choices.length > 0) {
                for (let i = 0; i < request.choices.length; i++) {
                    console.log(`  ${i + 1}. ${request.choices[i]}`);
                }
            }

            if (request.allowFreeResponse) {
                console.log(
                    "\x1b[2m(type a number to select, or enter a free response)\x1b[0m",
                );
            }

            let answer: string;
            while (true) {
                const raw = await promptUser("> ");
                const choiceIndex = Number.parseInt(raw, 10) - 1;
                if (
                    Number.isInteger(choiceIndex) &&
                    choiceIndex >= 0 &&
                    choiceIndex < request.choices.length
                ) {
                    answer = request.choices[choiceIndex] ?? raw;
                    break;
                }
                if (request.allowFreeResponse) {
                    answer = raw;
                    break;
                }
                console.log(
                    `\x1b[33mPlease enter a number between 1 and ${request.choices.length}.\x1b[0m`,
                );
            }

            responses.set(interventionRequestId, { answer });
        },

        async getResponse(interventionRequestId) {
            const response = responses.get(interventionRequestId);
            if (!response) {
                throw new Error(
                    `No response found for intervention: ${interventionRequestId}`,
                );
            }
            return response;
        },
    };
}
