import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitepress";

/** canonical site URL, served from a custom domain. */
const SITE_URL = "https://hephaestus.odysseusdev.io";
/** site-wide description, used for `<meta description>` and social previews. */
const SITE_DESCRIPTION = "write ai agents once in markdown, forge them for your coding harness.";

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const PACKAGE_JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");

/** current package version, read from the root `package.json` at build time. */
const PACKAGE_VERSION = (
  JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8")) as { version: string }
).version;

/**
 * read an icon SVG from `public/icons/`.
 * @param name - icon filename without the `.svg` extension.
 * @returns the trimmed SVG markup.
 */
function readIconSvg(name: string): string {
  return readFileSync(join(ICONS_DIR, `${name}.svg`), "utf-8").trim();
}

export default defineConfig({
  title: "hephaestus",
  titleTemplate: ":title · hephaestus",
  description: SITE_DESCRIPTION,
  base: "/",
  cleanUrls: true,
  ignoreDeadLinks: false,

  /**
   * skip the `:title · hephaestus` template on the home page
   * @param pageData - the page's frontmatter and metadata.
   */
  transformPageData(pageData) {
    if (pageData.frontmatter.layout === "home") {
      pageData.titleTemplate = false;
    }
  },

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/fire.svg" }],
    ["meta", { name: "theme-color", content: "#24273a" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "hephaestus" }],
    ["meta", { property: "og:title", content: "hephaestus" }],
    ["meta", { property: "og:description", content: SITE_DESCRIPTION }],
    ["meta", { property: "og:image", content: `${SITE_URL}/og-image.png` }],
    ["meta", { property: "og:url", content: SITE_URL }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "hephaestus" }],
    ["meta", { name: "twitter:description", content: SITE_DESCRIPTION }],
    ["meta", { name: "twitter:image", content: `${SITE_URL}/og-image.png` }],
  ],

  markdown: {
    theme: { light: "catppuccin-latte", dark: "catppuccin-macchiato" },
  },

  themeConfig: {
    logo: "/fire.svg",

    outline: { level: [2, 3], label: "on this page" },
    returnToTopLabel: "return to top",
    sidebarMenuLabel: "menu",
    darkModeSwitchLabel: "appearance",
    lightModeSwitchTitle: "switch to light theme",
    darkModeSwitchTitle: "switch to dark theme",
    docFooter: { prev: "previous page", next: "next page" },
    notFound: {
      title: "page not found",
      quote: "nothing forged at this path.",
      linkText: "back to the forge",
    },

    nav: [
      { text: "guide", link: "/guide/getting-started" },
      { text: "reference", link: "/reference/commands" },
      {
        text: `v${PACKAGE_VERSION}`,
        items: [
          {
            text: "changelog",
            link: "https://github.com/odysseusdev/hephaestus/blob/main/CHANGELOG.md",
          },
          { text: "npm", link: "https://www.npmjs.com/package/@odysseusdev/hephaestus" },
        ],
      },
    ],

    sidebar: [
      {
        text: "guide",
        items: [
          { text: "getting started", link: "/guide/getting-started" },
          { text: "concepts", link: "/guide/concepts" },
          { text: "ci usage", link: "/guide/ci" },
        ],
      },
      {
        text: "reference",
        items: [
          { text: "commands", link: "/reference/commands" },
          { text: "configuration", link: "/reference/configuration" },
          { text: "canonical source", link: "/reference/canonical-source" },
          { text: "harnesses", link: "/reference/harnesses" },
          { text: "lockfile", link: "/reference/lockfile" },
        ],
      },
    ],

    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "search",
                buttonAriaLabel: "search",
              },
              modal: {
                noResultsText: "no results for",
                resetButtonTitle: "reset search",
                footer: {
                  selectText: "select",
                  navigateText: "navigate",
                  closeText: "close",
                },
              },
            },
          },
        },
      },
    },

    socialLinks: [
      {
        icon: { svg: readIconSvg("github") },
        link: "https://github.com/odysseusdev/hephaestus",
        ariaLabel: "github",
      },
      {
        icon: { svg: readIconSvg("npm") },
        link: "https://www.npmjs.com/package/@odysseusdev/hephaestus",
        ariaLabel: "npm",
      },
      {
        icon: { svg: readIconSvg("github-sponsors") },
        link: "https://github.com/sponsors/odysseusdev?frequency=one-time",
        ariaLabel: "github sponsors",
      },
      {
        icon: { svg: readIconSvg("ko-fi") },
        link: "https://ko-fi.com/odysseusdev",
        ariaLabel: "ko-fi",
      },
    ],

    footer: {
      message: "released under the MIT license.",
      copyright: "copyright © odysseusdev",
    },
  },
});
