const pkgPath = `${import.meta.dir}/../package.json`;
const pkg = await Bun.file(pkgPath).json();

for (const [dep, version] of Object.entries(
    pkg.dependencies as Record<string, string>,
)) {
    if (!version.startsWith("workspace:")) continue;
    const range = version.slice("workspace:".length);
    const depDir = dep.replace("@remoraflow/", "");
    const depPkg = await Bun.file(
        `${import.meta.dir}/../../${depDir}/package.json`,
    ).json();
    const resolved =
        range === "*" ? depPkg.version : `${range}${depPkg.version}`;
    pkg.dependencies[dep] = resolved;
}

await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
