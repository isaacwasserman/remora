import { describe, expect, it } from "bun:test";
import { templateToRegex } from "./utils";

describe("templateToRegex - Basic Functionality", () => {
    it("converts a simple single-placeholder template", () => {
        const template = "Hello ${name}!";
        const pattern = templateToRegex(template);

        expect(pattern).toBe("^Hello .+!$");

        const regex = new RegExp(pattern);
        expect(regex.test("Hello Alice!")).toBe(true);
        expect(regex.test("Hello Bob!")).toBe(true);
        expect(regex.test("Hello !")).toBe(false);
        expect(regex.test("Hello")).toBe(false); // missing space and exclamation
    });

    it("handles multiple placeholders correctly", () => {
        const template = "${greeting} ${name}, welcome to ${place}!";
        const pattern = templateToRegex(template);

        expect(pattern).toBe("^.+ .+, welcome to .+!$");

        const regex = new RegExp(pattern);
        expect(regex.test("Hi Sarah, welcome to Paris!")).toBe(true);
        expect(regex.test("Hello John, welcome to Earth!")).toBe(true);
        expect(regex.test("Invalid string")).toBe(false);
    });

    it("handles templates with no placeholders", () => {
        const template = "Static plain text string";
        const pattern = templateToRegex(template);

        expect(pattern).toBe("^Static plain text string$");

        const regex = new RegExp(pattern);
        expect(regex.test("Static plain text string")).toBe(true);
        expect(regex.test("Static plain text string ")).toBe(false);
    });
});

describe("templateToRegex - Special Character Escaping", () => {
    it("escapes regex special characters in static text segments", () => {
        const template = "https://${domain}.com/api/v1?user=${id}&active=true";
        const pattern = templateToRegex(template);

        // . and ? must be escaped as \\. and \\?
        expect(pattern).toBe("^https://.+\\.com/api/v1\\?user=.+&active=true$");

        const regex = new RegExp(pattern);
        expect(
            regex.test("https://example.com/api/v1?user=123&active=true"),
        ).toBe(true);
        expect(
            regex.test("https://exampleXcom/api/v1?user=123&active=true"),
        ).toBe(false);
    });

    it("escapes brackets, parentheses, and math operators", () => {
        const template = "[SYSTEM] (${level}): +${count} items * 100";
        const pattern = templateToRegex(template);

        expect(pattern).toBe("^\\[SYSTEM\\] \\(.+\\): \\+.+ items \\* 100$");

        const regex = new RegExp(pattern);
        expect(regex.test("[SYSTEM] (INFO): +5 items * 100")).toBe(true);
    });
});

describe("templateToRegex - Custom Type Map", () => {
    it("replaces placeholders with custom regex patterns", () => {
        const template = "user_${id}_${role}";
        const pattern = templateToRegex(template, {
            id: "\\d+",
            role: "admin|editor|viewer",
        });

        expect(pattern).toBe("^user_(?:\\d+)_(?:admin|editor|viewer)$");

        const regex = new RegExp(pattern);
        expect(regex.test("user_101_admin")).toBe(true);
        expect(regex.test("user_42_editor")).toBe(true);
        expect(regex.test("user_abc_admin")).toBe(false); // id is not digits
        expect(regex.test("user_101_guest")).toBe(false); // invalid role
    });

    it("falls back to .+ for unmapped placeholders", () => {
        const template = "${protocol}://${host}:${port}";
        const pattern = templateToRegex(template, {
            port: "\\d+", // only port is specified
        });

        expect(pattern).toBe("^.+://.+:(?:\\d+)$");

        const regex = new RegExp(pattern);
        expect(regex.test("https://localhost:8080")).toBe(true);
        expect(regex.test("https://localhost:abc")).toBe(false);
    });
});

describe("templateToRegex - Edge Cases & Trimming", () => {
    it("handles spaces inside placeholder declarations", () => {
        const template = "Hello ${  name  }!";
        const pattern = templateToRegex(template, { name: "[a-zA-Z]+" });

        expect(pattern).toBe("^Hello (?:[a-zA-Z]+)!$");
    });

    it("handles consecutive placeholders without static separators", () => {
        const template = "${prefix}${id}";
        const pattern = templateToRegex(template, {
            prefix: "[A-Z]{2}",
            id: "\\d{4}",
        });

        expect(pattern).toBe("^(?:[A-Z]{2})(?:\\d{4})$");

        const regex = new RegExp(pattern);
        expect(regex.test("US1234")).toBe(true);
        expect(regex.test("U12345")).toBe(false);
    });

    it("returns empty anchored string for an empty input", () => {
        const pattern = templateToRegex("");
        expect(pattern).toBe("^$");

        const regex = new RegExp(pattern);
        expect(regex.test("")).toBe(true);
        expect(regex.test("a")).toBe(false);
    });
});
