import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const VIEWER_DIR = path.join(ROOT, "src/viewer");
const OUTPUT_DIR = path.join(ROOT, "docs/public/r");

const VIEWER_PREFIX = "components/workflow-viewer";
const PANEL_PREFIX = "components/workflow-step-detail-panel";

interface FileEntry {
	relPath: string;
	type: string;
}

const VIEWER_FILES: FileEntry[] = [
	{ relPath: "workflow-viewer.tsx", type: "registry:component" },
	{ relPath: "graph-layout.ts", type: "registry:component" },
	{ relPath: "theme.tsx", type: "registry:component" },
	{ relPath: "edges/workflow-edge.tsx", type: "registry:component" },
	{ relPath: "nodes/base-node.tsx", type: "registry:component" },
	{ relPath: "nodes/tool-call-node.tsx", type: "registry:component" },
	{ relPath: "nodes/llm-prompt-node.tsx", type: "registry:component" },
	{ relPath: "nodes/extract-data-node.tsx", type: "registry:component" },
	{ relPath: "nodes/switch-case-node.tsx", type: "registry:component" },
	{ relPath: "nodes/for-each-node.tsx", type: "registry:component" },
	{ relPath: "nodes/start-node.tsx", type: "registry:component" },
	{ relPath: "nodes/start-step-node.tsx", type: "registry:component" },
	{ relPath: "nodes/end-node.tsx", type: "registry:component" },
	{ relPath: "nodes/group-header-node.tsx", type: "registry:component" },
	{ relPath: "nodes/sleep-node.tsx", type: "registry:component" },
	{ relPath: "nodes/wait-for-condition-node.tsx", type: "registry:component" },
	{ relPath: "nodes/agent-loop-node.tsx", type: "registry:component" },
];

const PANEL_FILES: FileEntry[] = [
	{ relPath: "panels/step-detail-panel.tsx", type: "registry:component" },
];

function transformImports(
	content: string,
	fileRelPath: string,
	registryFiles: Set<string>,
): string {
	const fileDir = path.dirname(fileRelPath);

	return content.replace(
		/(from\s+["'])([^"']+)(["'])/g,
		(match, prefix, specifier, suffix) => {
			if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
				return match;
			}

			// Resolve the relative import to a path relative to the viewer root.
			const resolved = path.normalize(path.join(fileDir, specifier));

			// If the resolved path points to a file in the registry, keep it relative.
			if (registryFiles.has(resolved)) {
				return match;
			}

			// Resolved path goes outside the viewer directory — use main package.
			// Otherwise it's a viewer-internal file — use the viewer subpath.
			if (resolved.startsWith("..")) {
				return `${prefix}@isaacwasserman/remora${suffix}`;
			}
			return `${prefix}@isaacwasserman/remora/viewer${suffix}`;
		},
	);
}

async function processFiles(files: FileEntry[], registryPrefix: string) {
	// Build a set of registry-relative paths (without extensions) for lookup.
	const registryFiles = new Set<string>();
	for (const { relPath } of files) {
		registryFiles.add(relPath.replace(/\.[^.]+$/, ""));
	}

	return Promise.all(
		files.map(async ({ relPath, type }) => {
			const raw = await Bun.file(path.join(VIEWER_DIR, relPath)).text();
			const content = transformImports(raw, relPath, registryFiles);
			return { path: `${registryPrefix}/${relPath}`, content, type };
		}),
	);
}

async function main() {
	await Bun.$`mkdir -p ${OUTPUT_DIR}`;

	const [viewerFiles, panelFiles] = await Promise.all([
		processFiles(VIEWER_FILES, VIEWER_PREFIX),
		processFiles(PANEL_FILES, PANEL_PREFIX),
	]);

	const viewerItem = {
		$schema: "https://ui.shadcn.com/schema/registry-item.json",
		name: "workflow-viewer",
		type: "registry:block",
		title: "Workflow Viewer",
		description:
			"Interactive DAG visualization for Remora workflow definitions, built with React Flow. Requires Tailwind CSS and @xyflow/react/dist/style.css to be imported in your app.",
		dependencies: ["@isaacwasserman/remora", "@xyflow/react", "@dagrejs/dagre"],
		registryDependencies: [],
		files: viewerFiles,
	};

	const panelItem = {
		$schema: "https://ui.shadcn.com/schema/registry-item.json",
		name: "workflow-step-detail-panel",
		type: "registry:block",
		title: "Workflow Step Detail Panel",
		description:
			"Detail panel that displays step parameters and diagnostics for a selected workflow step. Pair with WorkflowViewer for a complete workflow visualization experience.",
		dependencies: ["@isaacwasserman/remora"],
		registryDependencies: [],
		files: panelFiles,
	};

	const registry = {
		$schema: "https://ui.shadcn.com/schema/registry.json",
		name: "remora",
		homepage: "https://isaacwasserman.github.io/remora/",
		items: [
			{
				name: viewerItem.name,
				type: viewerItem.type,
				title: viewerItem.title,
				description: viewerItem.description,
				dependencies: viewerItem.dependencies,
				registryDependencies: viewerItem.registryDependencies,
			},
			{
				name: panelItem.name,
				type: panelItem.type,
				title: panelItem.title,
				description: panelItem.description,
				dependencies: panelItem.dependencies,
				registryDependencies: panelItem.registryDependencies,
			},
		],
	};

	await Promise.all([
		Bun.write(
			path.join(OUTPUT_DIR, "workflow-viewer.json"),
			JSON.stringify(viewerItem, null, 2),
		),
		Bun.write(
			path.join(OUTPUT_DIR, "workflow-step-detail-panel.json"),
			JSON.stringify(panelItem, null, 2),
		),
		Bun.write(
			path.join(OUTPUT_DIR, "registry.json"),
			JSON.stringify(registry, null, 2),
		),
	]);

	console.log("Registry build complete:");
	console.log(`  ${OUTPUT_DIR}/registry.json`);
	console.log(
		`  ${OUTPUT_DIR}/workflow-viewer.json (${viewerFiles.length} files)`,
	);
	console.log(
		`  ${OUTPUT_DIR}/workflow-step-detail-panel.json (${panelFiles.length} files)`,
	);
}

main();
