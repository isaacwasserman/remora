import { describe, expect, test } from "bun:test";
import { queryRootNames } from "./root-names";

describe("queryRootNames", () => {
    test.each([
        ["a", ["a"]],
        ["a.b.c", ["a"]],
        ["a[0].b", ["a"]],
        ["a[*].b", ["a"]],
        ["a.*.b", ["a"]],
        ["a[?b == c].d", ["a"]],
        ["a[] | b", ["a"]],
        ["a || b && !c", ["a", "b", "c"]],
        ["a.x == b.y", ["a", "b"]],
        ["[a.x, b]", ["a", "b"]],
        ["{x: a.x, y: b}", ["a", "b"]],
        ["length(a)", ["a"]],
        ["sort_by(a, &b)", ["a"]],
        ["merge(a, {k: b})", ["a", "b"]],
        ["a.b || a.c", ["a"]],
        ["`1`", []],
        ["@", []],
    ])("%s reads %j from the root", (query, expected) => {
        expect(queryRootNames(query)).toEqual(expected);
    });

    test("returns no names for a query that does not compile", () => {
        expect(queryRootNames("a[")).toEqual([]);
    });
});
