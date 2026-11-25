import styles from './App.module.css';

// Scaffold shell: the console layout (navy sidebar + light content) wired to the
// design tokens. Real screens (Sign in, Pages, Detail, Add client) arrive in the
// frontend phase.
export default function App() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SEO Tracker</div>
        <nav className={styles.nav}>
          <a className={`${styles.navItem} ${styles.active}`} href="#">
            Pages
          </a>
          <a className={styles.navItem} href="#">
            Clients
          </a>
          <a className={styles.navItem} href="#">
            Add client
          </a>
        </nav>
      </aside>
      <main className={styles.content}>
        <h1>SEO Keyword Tracker</h1>
        <p className={styles.muted}>Scaffold ready — screens arrive in the next phases.</p>
      </main>
    </div>
  );
}
