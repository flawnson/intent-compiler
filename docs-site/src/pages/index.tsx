import clsx from "clsx";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import styles from "./index.module.css";

const features = [
  {
    title: "Guided Onboarding",
    description:
      "Choose provider, database, ORM, API architecture, and environment setup in one init flow."
  },
  {
    title: "AOT Intent Compilation",
    description:
      "Scan prompt templates, gather schema context, and compile deterministic query artifacts before runtime."
  },
  {
    title: "Typed Runtime Execution",
    description:
      "Resolve prepared prompts to persisted query logic and run with your own adapter and validation layer."
  }
];

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <article className={styles.feature}>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="intent-compiler"
      description="Type-safe natural language intent compilation for backend workflows."
    >
      <header className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={clsx("container", styles.heroContent)}>
          <p className={styles.kicker}>AOT Intent Compilation</p>
          <h1>intent-compiler</h1>
          <p>
            Compile natural-language backend intents into stable query and mutation logic before deployment.
          </p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to="/docs/getting-started">
              Get Started
            </Link>
            <Link className="button button--secondary button--lg" to="/api">
              API Reference
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.band}>
          <div className="container">
            <div className={styles.grid}>
              {features.map((feature) => (
                <Feature key={feature.title} title={feature.title} description={feature.description} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
