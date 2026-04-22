import Layout from "@theme/Layout";
import styles from "./api.module.css";

export default function ApiPage(): JSX.Element {
  return (
    <Layout title="API Reference" description="Generated TypeDoc API reference for intent-compiler.">
      <main className={styles.main}>
        <div className="container">
          <p className={styles.lead}>
            Generated from source with TypeDoc. Open in a new tab for full-page browsing if preferred.
          </p>
          <a className={styles.link} href="/typedoc/index.html" target="_blank" rel="noreferrer">
            Open API Reference
          </a>
        </div>
        <iframe
          className={styles.frame}
          src="/typedoc/index.html"
          title="intent-compiler TypeDoc API reference"
        />
      </main>
    </Layout>
  );
}
