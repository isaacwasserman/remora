import { useEffect, useState } from "react";

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
