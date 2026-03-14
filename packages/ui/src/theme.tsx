import { useEffect, useMemo, useState } from "react";

/**
 * Detects dark mode by observing the `dark` class on `<html>`,
 * following the shadcn/Tailwind convention (`darkMode: "class"`).
 */
export function useDarkMode(): boolean {
	const [dark, setDark] = useState(
		() =>
			typeof document !== "undefined" &&
			document.documentElement.classList.contains("dark"),
	);

	useEffect(() => {
		const el = document.documentElement;
		const observer = new MutationObserver(() => {
			setDark(el.classList.contains("dark"));
		});
		observer.observe(el, { attributes: true, attributeFilter: ["class"] });
		setDark(el.classList.contains("dark"));
		return () => observer.disconnect();
	}, []);

	return dark;
}

/**
 * Resolves a CSS custom property to a usable color string.
 * Handles both shadcn v0 (space-separated HSL components) and
 * v2 (complete color values) formats.
 */
function resolveCssColor(varName: string, fallback: string): string {
	if (typeof document === "undefined") return fallback;
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue(varName)
		.trim();
	if (!raw) return fallback;
	if (/^\d/.test(raw) && !raw.startsWith("0x")) {
		return `hsl(${raw})`;
	}
	return raw;
}

/**
 * Returns resolved theme colors from shadcn CSS custom properties,
 * with sensible fallbacks for apps that don't define them.
 * Re-resolves automatically when dark mode toggles.
 */
export function useThemeColors() {
	const dark = useDarkMode();

	return useMemo(() => {
		const resolve = (v: string, fb: string) => resolveCssColor(v, fb);
		return {
			dark,
			border: resolve("--border", dark ? "#374151" : "#e5e7eb"),
			mutedForeground: resolve(
				"--muted-foreground",
				dark ? "#9ca3af" : "#6b7280",
			),
			card: resolve("--card", dark ? "#1f2937" : "#ffffff"),
		};
	}, [dark]);
}
