import type { WorkflowDefinition } from "@remoraflow/core";
import type { LayoutDirection } from "@remoraflow/ui";
import {
    ArrowDownUp,
    ArrowLeftRight,
    Check,
    ChevronDown,
    Download,
    Moon,
    Play,
    Plus,
    RotateCcw,
    Settings,
    Share2,
    Shield,
    Sun,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Switch } from "~/components/ui/switch";
import remoraflowLogo from "../assets/remoraflow-logo.svg";
import type { SavedWorkflow } from "../lib/storage.ts";
import { loadCustomWorkflows, saveCustomWorkflows } from "../lib/storage.ts";

interface ToolbarProps {
    workflow: WorkflowDefinition | null;
    isEditing: boolean;
    onEditingChange: (editing: boolean) => void;
    isRunning: boolean;
    onRun: () => void;
    onReset: () => void;
    onLoadWorkflow: (workflow: WorkflowDefinition, key: string) => void;
    onExport: () => void;
    onShare: () => void;
    onNewWorkflow: () => void;
    onAudit: () => void;
    onOpenSettings: () => void;
    hasLLMConfig: boolean;
    layout: LayoutDirection;
    onLayoutChange: (direction: LayoutDirection) => void;
    isDark: boolean;
    onDarkModeToggle: () => void;
}

export function Toolbar({
    workflow,
    isEditing,
    onEditingChange,
    isRunning,
    onRun,
    onReset,
    onLoadWorkflow,
    onExport,
    onShare,
    onNewWorkflow,
    onAudit,
    onOpenSettings,
    hasLLMConfig,
    layout,
    onLayoutChange,
    isDark,
    onDarkModeToggle,
}: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [copied, setCopied] = useState(false);

    const handleShareClick = () => {
        onShare().then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const wf = JSON.parse(reader.result as string);
                onLoadWorkflow(wf, `import:${file.name}`);
            } catch {
                // invalid JSON — ignore
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleSaveCurrent = () => {
        if (!workflow) return;
        const name = prompt("Workflow name:");
        if (!name?.trim()) return;
        const customs = loadCustomWorkflows();
        const existing = customs.findIndex((c) => c.name === name);
        const entry: SavedWorkflow = { name, workflow };
        if (existing >= 0) {
            customs[existing] = entry;
        } else {
            customs.push(entry);
        }
        saveCustomWorkflows(customs);
    };

    const customWorkflows = loadCustomWorkflows();

    return (
        <header className="h-12 border-b border-border flex items-center px-4 gap-2 shrink-0 bg-card">
            <img src={remoraflowLogo} alt="RemoraFlow" className="h-7 mr-2" />

            <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Switch
                        size="sm"
                        checked={isEditing}
                        onCheckedChange={onEditingChange}
                    />
                    {isEditing ? "Edit" : "View"}
                </label>
            </div>

            <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white ml-1"
                disabled={!workflow || isRunning}
                onClick={onRun}
            >
                <Play className="size-3.5" />
                Run
            </Button>

            <Button
                variant="outline"
                size="sm"
                disabled={!workflow}
                onClick={onReset}
            >
                <RotateCcw className="size-3.5" />
                Reset
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        Open
                        <ChevronDown className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Demo Workflows</DropdownMenuLabel>
                    <DropdownMenuItem
                        onSelect={() => {
                            import("../workflows/pokemon-lookup.json").then(
                                (m) =>
                                    onLoadWorkflow(
                                        m.default as WorkflowDefinition,
                                        "demo:pokemon-lookup",
                                    ),
                            );
                        }}
                    >
                        Pokemon Lookup
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => {
                            import("../workflows/pokemon-analyst.json").then(
                                (m) =>
                                    onLoadWorkflow(
                                        m.default as WorkflowDefinition,
                                        "demo:pokemon-analyst",
                                    ),
                            );
                        }}
                    >
                        Pokemon Battle Analyst
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => {
                            import("../workflows/tournament-prep.json").then(
                                (m) =>
                                    onLoadWorkflow(
                                        m.default as WorkflowDefinition,
                                        "demo:tournament-prep",
                                    ),
                            );
                        }}
                    >
                        Tournament Prep (Stress Test)
                    </DropdownMenuItem>

                    {customWorkflows.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>
                                Custom Workflows
                            </DropdownMenuLabel>
                            {customWorkflows.map((cw) => (
                                <DropdownMenuItem
                                    key={cw.name}
                                    onSelect={() =>
                                        onLoadWorkflow(
                                            cw.workflow,
                                            `custom:${cw.name}`,
                                        )
                                    }
                                >
                                    {cw.name}
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onSelect={() => fileInputRef.current?.click()}
                    >
                        Import JSON...
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={handleSaveCurrent}
                        disabled={!workflow}
                    >
                        Save Current...
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                disabled={!workflow}
            >
                <Download className="size-3.5" />
                Export
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleShareClick}
                disabled={!workflow || copied}
            >
                {copied ? (
                    <Check className="size-3.5" />
                ) : (
                    <Share2 className="size-3.5" />
                )}
                {copied ? "Copied!" : "Share"}
            </Button>

            <Button variant="outline" size="sm" onClick={onNewWorkflow}>
                <Plus className="size-3.5" />
                New
            </Button>

            <div className="flex-1" />

            <Button
                variant="outline"
                size="sm"
                onClick={onAudit}
                disabled={!workflow}
            >
                <Shield className="size-3.5" />
                Audit
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="relative"
            >
                <Settings className="size-3.5" />
                Settings
                {hasLLMConfig && (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-500" />
                )}
            </Button>

            <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                    onLayoutChange(
                        layout === "vertical" ? "horizontal" : "vertical",
                    )
                }
                title={
                    layout === "vertical"
                        ? "Switch to horizontal layout"
                        : "Switch to vertical layout"
                }
            >
                {layout === "vertical" ? (
                    <ArrowDownUp className="size-3.5" />
                ) : (
                    <ArrowLeftRight className="size-3.5" />
                )}
            </Button>

            <Button
                variant="ghost"
                size="icon-xs"
                onClick={onDarkModeToggle}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
                {isDark ? (
                    <Sun className="size-3.5" />
                ) : (
                    <Moon className="size-3.5" />
                )}
            </Button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
            />
        </header>
    );
}
