import { defineConfig } from "vitepress";

export default defineConfig({
  title: "intent-compiler",
  description: "Ahead-of-time compiler for natural-language backend intents.",
  cleanUrls: true,
  themeConfig: {
    siteTitle: "intent-compiler",
    logo: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=120&q=80",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Workflow", link: "/guide/workflow" },
      { text: "API", link: "/api/" }
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Workflow", link: "/guide/workflow" },
            { text: "Runtime Integration", link: "/guide/runtime" }
          ]
        }
      ]
    },
    socialLinks: [{ icon: "github", link: "https://github.com/your-org/intent-compiler" }],
    footer: {
      message: "Built for production backend workflows.",
      copyright: `Copyright ${new Date().getFullYear()} intent-compiler`
    },
    search: {
      provider: "local"
    }
  }
});
