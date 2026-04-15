import { useCallback, useEffect, useState } from "react";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";
import { Label } from "../panels/shared";
import { JsonCodeEditor } from "./json-code-editor";

const ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]+$/;

export function StepIdInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);

  const handleBlur = useCallback(() => {
    if (!draft || !ID_REGEX.test(draft)) {
      setError(
        "Must start with letter/underscore, contain only letters, digits, underscores (min 2 chars)",
      );
      return;
    }
    setError("");
    if (draft !== value) {
      onChange(draft);
    }
  }, [draft, value, onChange]);

  return (
    <div>
      <Label>Step ID</Label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        className={cn(
          "rf:h-8 rf:text-xs rf:font-mono",
          error && "rf:border-red-500 rf:focus-visible:ring-red-500/50",
        )}
        placeholder="step_id"
      />
      {error && (
        <div className="rf:text-[10px] rf:text-red-500 rf:mt-0.5">{error}</div>
      )}
    </div>
  );
}

export function StepIdDropdown({
  label,
  value,
  onChange,
  stepIds,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  stepIds: string[];
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select
        value={value || "__empty__"}
        onValueChange={(val) => onChange(val === "__empty__" ? "" : val)}
      >
        <SelectTrigger className="rf:h-8 rf:text-xs rf:font-mono rf:w-full">
          <SelectValue placeholder="— none —" />
        </SelectTrigger>
        <SelectContent>
          {(allowEmpty || !value) && (
            <SelectItem value="__empty__">— none —</SelectItem>
          )}
          {stepIds.map((id) => (
            <SelectItem key={id} value={id}>
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function JsonEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: object;
  onChange: (value: object) => void;
}) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2));

  useEffect(() => {
    setDraft(JSON.stringify(value, null, 2));
  }, [value]);

  const handleBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(draft);
      onChange(parsed);
    } catch {
      // Validation errors shown inline by CodeMirror linter
    }
  }, [draft, onChange]);

  return (
    <div>
      <Label>{label}</Label>
      <JsonCodeEditor value={draft} onChange={setDraft} onBlur={handleBlur} />
    </div>
  );
}
