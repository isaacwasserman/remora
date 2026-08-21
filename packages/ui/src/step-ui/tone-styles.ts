import type { ToneKey } from "./tones";

export function toneColor(tone: ToneKey): string {
    return `var(--rf-tone-${tone})`;
}

export function toneStyle(tone: ToneKey): React.CSSProperties {
    return { color: toneColor(tone) };
}

export function toneBorderStyle(tone: ToneKey): React.CSSProperties {
    return { borderColor: toneColor(tone) };
}
