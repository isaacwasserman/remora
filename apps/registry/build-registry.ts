import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const VIEWER_DIR = path.join(ROOT, "packages/ui/src");
const OUTPUT_DIR = path.join(ROOT, "apps/docs/public/r");

const VIEWER_PREFIX = "components/workflow-viewer";
const PANEL_PREFIX = "components/workflow-step-detail-panel";

interface FileEntry {
    relPath: string;
    type: string;
}

const VIEWER_FILES: FileEntry[] = [
    { relPath: "components/ui/combobox.tsx", type: "registry:ui" },
    { relPath: "workflow-viewer.tsx", type: "registry:component" },
    { relPath: "graph-layout.ts", type: "registry:component" },
    { relPath: "theme.tsx", type: "registry:component" },
    { relPath: "edit-context.tsx", type: "registry:component" },
    { relPath: "execution-state.ts", type: "registry:component" },
    { relPath: "tool-schemas-context.tsx", type: "registry:component" },
    { relPath: "text-styles.ts", type: "registry:component" },
    // layout
    { relPath: "layout/index.ts", type: "registry:component" },
    { relPath: "layout/constants.ts", type: "registry:component" },
    { relPath: "layout/measure.ts", type: "registry:component" },
    { relPath: "layout/types.ts", type: "registry:component" },
    // hooks
    { relPath: "hooks/use-editable-workflow.ts", type: "registry:component" },
    { relPath: "hooks/use-context-menu.ts", type: "registry:component" },
    { relPath: "hooks/use-selection-state.ts", type: "registry:component" },
    { relPath: "hooks/use-workflow-execution.ts", type: "registry:component" },
    // utils
    { relPath: "utils/step-defaults.ts", type: "registry:component" },
    { relPath: "utils/nested-chain-refs.ts", type: "registry:component" },
    { relPath: "utils/stub-tools.ts", type: "registry:component" },
    { relPath: "utils/expression-display.ts", type: "registry:component" },
    { relPath: "utils/diagnostic-matching.ts", type: "registry:component" },
    { relPath: "utils/rendered-params.ts", type: "registry:component" },
    // edges
    { relPath: "edges/workflow-edge.tsx", type: "registry:component" },
    // nodes
    { relPath: "nodes/node-shell.tsx", type: "registry:component" },
    { relPath: "nodes/step-node.tsx", type: "registry:component" },
    { relPath: "nodes/start-node.tsx", type: "registry:component" },
    { relPath: "nodes/group-header-node.tsx", type: "registry:component" },
    { relPath: "nodes/group-container-node.tsx", type: "registry:component" },
    // components
    { relPath: "components/step-palette.tsx", type: "registry:component" },
    {
        relPath: "components/canvas-context-menu.tsx",
        type: "registry:component",
    },
    {
        relPath: "components/workflow-json-dialog.tsx",
        type: "registry:component",
    },
    { relPath: "components/replay-slider.tsx", type: "registry:component" },
    // syntax
    {
        relPath: "syntax/codemirror-template-highlighting.ts",
        type: "registry:component",
    },
    {
        relPath: "syntax/highlighted-expression.tsx",
        type: "registry:component",
    },
    { relPath: "syntax/jmespath.ts", type: "registry:component" },
    { relPath: "syntax/remora-template.ts", type: "registry:component" },
    // editors
    { relPath: "editors/code-input.tsx", type: "registry:component" },
    { relPath: "editors/codemirror-theme.ts", type: "registry:component" },
    {
        relPath: "editors/codemirror/use-codemirror.ts",
        type: "registry:component",
    },
    { relPath: "editors/expression-editor.tsx", type: "registry:component" },
    { relPath: "editors/expression-input.tsx", type: "registry:component" },
    {
        relPath: "editors/expression-scope-context.tsx",
        type: "registry:component",
    },
    { relPath: "editors/jmespath-code-editor.tsx", type: "registry:component" },
    { relPath: "editors/json-code-editor.tsx", type: "registry:component" },
    { relPath: "editors/json-editor.tsx", type: "registry:component" },
    { relPath: "editors/json-viewer.tsx", type: "registry:component" },
    { relPath: "editors/shared-editors.tsx", type: "registry:component" },
    { relPath: "editors/step-fields.tsx", type: "registry:component" },
    { relPath: "editors/template-code-editor.tsx", type: "registry:component" },
    {
        relPath: "editors/template-expression-input.tsx",
        type: "registry:component",
    },
    // editor fields
    { relPath: "editors/fields/boolean-field.tsx", type: "registry:component" },
    {
        relPath: "editors/fields/case-list-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/constant-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/expression-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/expression-map-field.tsx",
        type: "registry:component",
    },
    { relPath: "editors/fields/field-row.tsx", type: "registry:component" },
    {
        relPath: "editors/fields/identifier-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/json-schema-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/read-only-step-params.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/schema-map-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/step-ref-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/template-text-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/tool-ref-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/tool-ref-list-field.tsx",
        type: "registry:component",
    },
    {
        relPath: "editors/fields/workflow-extras-editor.tsx",
        type: "registry:component",
    },
    // step-ui
    { relPath: "step-ui/constraint-hints.ts", type: "registry:component" },
    { relPath: "step-ui/field-kinds.ts", type: "registry:component" },
    { relPath: "step-ui/param-access.ts", type: "registry:component" },
    { relPath: "step-ui/params.ts", type: "registry:component" },
    { relPath: "step-ui/registry.ts", type: "registry:component" },
    { relPath: "step-ui/tone-styles.ts", type: "registry:component" },
    { relPath: "step-ui/tones.ts", type: "registry:component" },
    { relPath: "step-ui/types.ts", type: "registry:component" },
    // panels
    {
        relPath: "panels/field-diagnostics-context.tsx",
        type: "registry:component",
    },
    { relPath: "panels/shared.tsx", type: "registry:component" },
    { relPath: "panels/step-detail-panel.tsx", type: "registry:component" },
    { relPath: "panels/step-editor-panel.tsx", type: "registry:component" },
];

// The detail panel and all of its dependencies are already shipped by the
// workflow-viewer registry. Re-listing them here would lay down a second copy
// at components/workflow-step-detail-panel/... when consumers install both.
// Instead, this item depends on workflow-viewer and ships no files of its own.
const PANEL_FILES: FileEntry[] = [];

/** Prefixes that map to shadcn-convention `@/` imports in the consumer's project. */
const SHADCN_INTERNAL_PREFIXES = ["components/ui/", "lib/"];

function transformImports(
    content: string,
    fileRelPath: string,
    registryFiles: Set<string>,
    registryName: string,
): string {
    const fileDir = path.dirname(fileRelPath);

    return content.replace(
        /(from\s+["'])([^"']+)(["'])/g,
        (match, prefix, specifier, suffix) => {
            // Pass through non-relative imports (npm packages, @/ aliases, etc.)
            if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
                return match;
            }

            // Resolve the relative import to a path relative to the viewer root.
            const resolved = path.normalize(path.join(fileDir, specifier));

            // If the resolved path points to a shadcn internal file (components/ui/*, lib/*),
            // always rewrite to the @/ alias — even when the file is also shipped by this
            // registry. shadcn relocates registry:ui files to the consumer's ui alias
            // (e.g. @/client/components/ui), not to a sibling folder of the registry's
            // other components, so a sibling-relative import won't resolve after install.
            for (const p of SHADCN_INTERNAL_PREFIXES) {
                if (resolved.startsWith(p)) {
                    return `${prefix}@/${resolved}${suffix}`;
                }
            }

            // Otherwise, if the file is shipped by this registry item, keep the
            // relative path so it resolves to the sibling file shadcn lays down.
            if (registryFiles.has(resolved)) {
                return match;
            }

            // Viewer-internal file not in this registry item. Consumers install the
            // registry without @remoraflow/ui, so silently rewriting to that package
            // produces a runtime "does not provide an export named X" error in their
            // bundler. Fail the build instead so missing dependencies are caught here.
            throw new Error(
                `[registry:${registryName}] ${fileRelPath} imports "${specifier}" ` +
                    `(resolves to "${resolved}") which is not in the registry file list. ` +
                    `Add it to the corresponding FILES array in apps/registry/build-registry.ts.`,
            );
        },
    );
}

async function processFiles(
    files: FileEntry[],
    registryPrefix: string,
    registryName: string,
) {
    // Build a set of registry-relative paths (without extensions) for lookup.
    const registryFiles = new Set<string>();
    for (const { relPath } of files) {
        const stem = relPath.replace(/\.[^.]+$/, "");
        registryFiles.add(stem);
        if (stem.endsWith("/index")) {
            registryFiles.add(stem.slice(0, -"/index".length));
        }
    }

    return Promise.all(
        files.map(async ({ relPath, type }) => {
            const raw = await Bun.file(path.join(VIEWER_DIR, relPath)).text();
            const content = transformImports(
                raw,
                relPath,
                registryFiles,
                registryName,
            );
            return { path: `${registryPrefix}/${relPath}`, content, type };
        }),
    );
}

async function main() {
    await Bun.$`mkdir -p ${OUTPUT_DIR}`;

    const [viewerFiles, panelFiles] = await Promise.all([
        processFiles(VIEWER_FILES, VIEWER_PREFIX, "workflow-viewer"),
        processFiles(PANEL_FILES, PANEL_PREFIX, "workflow-step-detail-panel"),
    ]);

    const viewerItem = {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "workflow-viewer",
        type: "registry:block",
        title: "Workflow Viewer",
        description:
            "Interactive DAG visualization for Remora workflow definitions, built with React Flow. Requires Tailwind CSS and @xyflow/react/dist/style.css to be imported in your app.",
        dependencies: [
            "@remoraflow/core",
            "@xyflow/react",
            "@dagrejs/dagre",
            "cmdk",
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lang-json",
            "@codemirror/language",
            "@codemirror/lint",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/highlight",
            "lucide-react",
        ],
        registryDependencies: [
            "badge",
            "button",
            "collapsible",
            "command",
            "dialog",
            "dropdown-menu",
            "input",
            "label",
            "popover",
            "select",
            "switch",
            "tabs",
            "textarea",
        ],
        files: viewerFiles,
    };

    const panelItem = {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "workflow-step-detail-panel",
        type: "registry:block",
        title: "Workflow Step Detail Panel",
        description:
            "Detail panel that displays step parameters and diagnostics for a selected workflow step. Pair with WorkflowViewer for a complete workflow visualization experience.",
        dependencies: [],
        registryDependencies: ["https://remoraflow.com/r/workflow-viewer.json"],
        files: panelFiles,
    };

    const registry = {
        $schema: "https://ui.shadcn.com/schema/registry.json",
        name: "remora",
        homepage: "https://remoraflow.com/",
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
