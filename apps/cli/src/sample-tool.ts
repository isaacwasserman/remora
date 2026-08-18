export function listNinjaTurtles(args: { includeSplinter: boolean }) {
    const turtles = ["Michaelangelo", "Donnatello", "Leonardo", "Raphaelo"];
    if (args.includeSplinter) {
        turtles.push("Splinter");
    }
    return turtles;
}
