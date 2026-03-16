import { tool } from "ai";
import { type } from "arktype";

const _demoStore = new Map<string, unknown>();

export const DEMO_TOOLS = {
	"get-weather": tool({
		description: "Get the current weather for a given location.",
		inputSchema: type({
			location: "string",
			temperatureUnit: "'f' | 'c'",
		}),
		outputSchema: type({
			temperature: "number",
			condition: "string",
		}),
		execute: async ({ location, temperatureUnit }) => {
			let temperature = Math.floor(Math.random() * 30) + 1;
			if (temperatureUnit === "f") {
				temperature = (temperature * 9) / 5 + 32;
			}
			const conditions = ["Sunny", "Cloudy", "Rainy"];
			const condition =
				conditions[Math.floor(Math.random() * conditions.length)];
			return { temperature, condition };
		},
	}),
};
