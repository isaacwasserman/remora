/** Randomize shadcn theme CSS custom properties for a fun demo effect. */

const FONT_STACKS = [
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  '"Georgia", "Times New Roman", serif',
  '"Courier New", "Fira Code", monospace',
  '"Avenir Next", "Avenir", "Helvetica Neue", sans-serif',
  '"Palatino Linotype", "Book Antiqua", Palatino, serif',
  '"SF Mono", "Fira Code", "Cascadia Code", monospace',
  '"Trebuchet MS", "Lucida Sans", sans-serif',
  "system-ui, -apple-system, sans-serif",
];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function oklch(l: number, c: number, h: number) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

export function randomizeTheme(dark: boolean) {
  const hue = rand(0, 360);
  const radius = rand(0.25, 1.25);

  // Font — set via CSS variable so body/#root inherit it
  const font = FONT_STACKS[Math.floor(Math.random() * FONT_STACKS.length)];
  setVar("--font-sans", font);

  // Radius
  setVar("--radius", `${radius.toFixed(3)}rem`);

  // Use noticeable chroma so the tint is visible
  const tint = rand(0.02, 0.05);

  if (dark) {
    // Dark mode palette — vary lightness to differentiate bg vs card
    const bgL = rand(0.12, 0.18);
    const cardL = bgL + rand(0.02, 0.06);
    setVar("--background", oklch(bgL, tint, hue));
    setVar("--foreground", oklch(rand(0.92, 0.98), tint * 0.4, hue));
    setVar("--card", oklch(cardL, tint, hue));
    setVar("--card-foreground", oklch(rand(0.92, 0.98), tint * 0.4, hue));
    setVar("--popover", oklch(cardL, tint, hue));
    setVar("--popover-foreground", oklch(rand(0.92, 0.98), tint * 0.4, hue));

    setVar("--primary", oklch(rand(0.55, 0.75), rand(0.15, 0.27), hue));
    setVar("--primary-foreground", oklch(0.15, tint * 0.5, hue));

    const secL = rand(0.22, 0.32);
    setVar("--secondary", oklch(secL, tint * 1.5, hue));
    setVar("--secondary-foreground", oklch(rand(0.92, 0.98), tint * 0.5, hue));
    setVar("--muted", oklch(secL, tint * 1.5, hue));
    setVar("--muted-foreground", oklch(rand(0.6, 0.75), tint, hue));
    setVar("--accent", oklch(secL + 0.03, tint * 2, hue));
    setVar("--accent-foreground", oklch(rand(0.92, 0.98), tint * 0.5, hue));

    const destHue = rand(15, 35);
    setVar("--destructive", oklch(0.4, rand(0.12, 0.16), destHue));
    setVar("--destructive-foreground", oklch(0.64, rand(0.2, 0.25), destHue));

    setVar("--border", oklch(secL - 0.02, tint * 0.3, hue));
    setVar("--input", oklch(secL, tint * 0.5, hue));
    setVar("--ring", oklch(0.56, tint * 2, hue));

    // Sidebar
    setVar("--sidebar", oklch(bgL - 0.02, tint * 0.5, hue));
    setVar("--sidebar-foreground", oklch(rand(0.92, 0.98), tint * 0.3, hue));
    setVar("--sidebar-primary", oklch(rand(0.45, 0.55), rand(0.2, 0.27), hue));
    setVar(
      "--sidebar-primary-foreground",
      oklch(rand(0.92, 0.98), tint * 0.3, hue),
    );
    setVar("--sidebar-accent", oklch(secL, tint * 2, hue));
    setVar(
      "--sidebar-accent-foreground",
      oklch(rand(0.92, 0.98), tint * 0.3, hue),
    );
    setVar("--sidebar-border", oklch(secL - 0.02, tint, hue));
    setVar("--sidebar-ring", oklch(0.56, tint * 2, hue));

    // Charts — spread across hue wheel
    for (let i = 1; i <= 5; i++) {
      const chartHue = (hue + i * 72) % 360;
      setVar(
        `--chart-${i}`,
        oklch(rand(0.5, 0.75), rand(0.17, 0.26), chartHue),
      );
    }
  } else {
    // Light mode palette — vary lightness for bg vs card
    const bgL = rand(0.95, 1.0);
    const cardL = bgL - rand(0.0, 0.03);
    setVar("--background", oklch(bgL, tint * 0.5, hue));
    setVar("--foreground", oklch(rand(0.12, 0.2), tint, hue));
    setVar("--card", oklch(cardL, tint * 0.5, hue));
    setVar("--card-foreground", oklch(rand(0.12, 0.2), tint, hue));
    setVar("--popover", oklch(cardL, tint * 0.5, hue));
    setVar("--popover-foreground", oklch(rand(0.12, 0.2), tint, hue));

    setVar("--primary", oklch(rand(0.35, 0.55), rand(0.15, 0.27), hue));
    setVar("--primary-foreground", oklch(0.985, tint * 0.5, hue));

    const secL = rand(0.92, 0.96);
    setVar("--secondary", oklch(secL, tint * 1.5, hue));
    setVar("--secondary-foreground", oklch(rand(0.15, 0.25), tint, hue));
    setVar("--muted", oklch(secL, tint * 1.5, hue));
    setVar("--muted-foreground", oklch(rand(0.45, 0.6), tint, hue));
    setVar("--accent", oklch(secL - 0.02, tint * 2, hue));
    setVar("--accent-foreground", oklch(rand(0.15, 0.25), tint, hue));

    const destHue = rand(15, 35);
    setVar("--destructive", oklch(0.58, rand(0.2, 0.26), destHue));
    setVar("--destructive-foreground", oklch(0.58, rand(0.2, 0.26), destHue));

    setVar("--border", oklch(secL - 0.03, tint * 0.8, hue));
    setVar("--input", oklch(secL - 0.02, tint, hue));
    setVar("--ring", oklch(0.71, tint * 2, hue));

    // Sidebar
    setVar("--sidebar", oklch(bgL - 0.01, tint * 0.8, hue));
    setVar("--sidebar-foreground", oklch(rand(0.12, 0.2), tint, hue));
    setVar("--sidebar-primary", oklch(rand(0.35, 0.5), rand(0.18, 0.27), hue));
    setVar("--sidebar-primary-foreground", oklch(0.985, tint, hue));
    setVar("--sidebar-accent", oklch(secL, tint * 2, hue));
    setVar("--sidebar-accent-foreground", oklch(rand(0.15, 0.25), tint, hue));
    setVar("--sidebar-border", oklch(secL - 0.03, tint, hue));
    setVar("--sidebar-ring", oklch(0.71, tint * 2, hue));

    // Charts — spread across hue wheel
    for (let i = 1; i <= 5; i++) {
      const chartHue = (hue + i * 72) % 360;
      setVar(
        `--chart-${i}`,
        oklch(rand(0.55, 0.8), rand(0.17, 0.24), chartHue),
      );
    }
  }
}
