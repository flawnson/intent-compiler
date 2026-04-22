import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "intent-compiler",
  tagline: "Compile natural-language backend intents before runtime.",
  url: "https://intent-compiler.dev",
  baseUrl: "/",
  onBrokenLinks: "warn",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: "intent-compiler",
      items: [
        {
          type: "docSidebar",
          sidebarId: "guideSidebar",
          position: "left",
          label: "Docs"
        },
        {
          to: "/api",
          label: "API",
          position: "left"
        },
        {
          href: "https://www.npmjs.com/package/intent-compiler",
          label: "npm",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started"
            },
            {
              label: "Workflow",
              to: "/docs/workflow"
            }
          ]
        },
        {
          title: "Project",
          items: [
            {
              label: "Repository",
              href: "https://github.com/intent-compiler/intent-compiler"
            },
            {
              label: "npm Package",
              href: "https://www.npmjs.com/package/intent-compiler"
            }
          ]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} intent-compiler`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula
    }
  } satisfies Preset.ThemeConfig
};

export default config;
