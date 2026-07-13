import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import "@catppuccin/vitepress/theme/macchiato/mauve.css";
import "./custom.css";

/** default VitePress theme, recolored via Catppuccin macchiato (mauve). */
export default {
  extends: DefaultTheme,
} satisfies Theme;
