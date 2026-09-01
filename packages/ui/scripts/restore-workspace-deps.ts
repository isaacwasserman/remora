const pkgPath = `${import.meta.dir}/../package.json`;
const pkg = await Bun.file(pkgPath).json();

pkg.dependencies["@remoraflow/core"] = "workspace:^";

await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
