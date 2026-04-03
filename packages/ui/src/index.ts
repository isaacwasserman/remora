/** @module viewer */

// NOTE: Styles are no longer auto-imported. Consumers should import
// "@remoraflow/ui/styles.css" explicitly if they need the default theme.
// This prevents CSS variable collisions when the host app defines its own
// :root variables (e.g., --primary, --background, --border).

// shadcn/ui components

export type { ReplaySliderProps } from "./components/replay-slider";
export { ReplaySlider } from "./components/replay-slider";
export type { StepPaletteProps } from "./components/step-palette";
export { StepPalette } from "./components/step-palette";
export { Button } from "./components/ui/button";
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export { Switch } from "./components/ui/switch";
export { Textarea } from "./components/ui/textarea";
export type { ExpressionEditorProps } from "./editors/expression-editor";
export { ExpressionEditor } from "./editors/expression-editor";
export type { JsonCodeEditorProps } from "./editors/json-code-editor";
export { JsonCodeEditor } from "./editors/json-code-editor";
export type { JsonViewerProps } from "./editors/json-viewer";
export { JsonViewer } from "./editors/json-viewer";
export type { StepExecutionSummary } from "./execution-state";
export { deriveStepSummaries } from "./execution-state";
export type { StepNodeData } from "./graph-layout";
export { buildEditableLayout, buildLayout } from "./graph-layout";
export type {
  UseWorkflowExecutionOptions,
  WorkflowExecutionControls,
} from "./hooks/use-workflow-execution";
export { useWorkflowExecution } from "./hooks/use-workflow-execution";
export type { StepDetailPanelProps } from "./panels/step-detail-panel";
export { StepDetailPanel } from "./panels/step-detail-panel";
export type { StepEditorPanelProps } from "./panels/step-editor-panel";
export { StepEditorPanel } from "./panels/step-editor-panel";
export { useDarkMode } from "./theme";
export { createDefaultStep, resetStepCounter } from "./utils/step-defaults";
export type { WorkflowViewerProps } from "./workflow-viewer";
export { WorkflowViewer } from "./workflow-viewer";
