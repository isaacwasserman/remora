import {
    matchFieldDiagnostics,
    stepLevelDiagnostics,
} from "./src/utils/diagnostic-matching.ts";

const diags = [
    {
        severity: "error",
        path: ["steps", 1, "params", "toolInput", "x", "expression"],
        message: "Invalid JMESPath expression: bad",
    },
    {
        severity: "warning",
        path: ["steps", 1, "params", "toolInput", "x"],
        message: "Possibly invalid: type",
    },
    {
        severity: "error",
        path: ["steps", 1, "params", "toolName"],
        message: "Missing tool",
    },
    { severity: "error", path: ["steps", 1], message: "Unreachable step" },
    {
        severity: "error",
        path: ["steps", 1, "description"],
        message: "must be a string",
    },
];
console.log(
    "toolInput.x:",
    matchFieldDiagnostics(diags, ["params", "toolInput", "x"]).map(
        (d) => d.message,
    ),
);
console.log(
    "toolName:",
    matchFieldDiagnostics(diags, ["params", "toolName"]).map((d) => d.message),
);
console.log(
    "description:",
    matchFieldDiagnostics(diags, ["description"]).map((d) => d.message),
);
console.log(
    "stepLevel:",
    stepLevelDiagnostics(diags).map((d) => d.message),
);
