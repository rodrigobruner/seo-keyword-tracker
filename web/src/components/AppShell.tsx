import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import styles from './AppShell.module.css';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navItem} ${styles.active}` : styles.navItem;

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SEO Tracker</div>
        <nav className={styles.nav}>
          <NavLink to="/pages" className={navItemClass}>
            Pages
          </NavLink>
          <NavLink to="/clients" className={navItemClass}>
            Clients
          </NavLink>
        </nav>
        <div className={styles.footer}>
          <span className={styles.email} title={user?.email}>
            {user?.email}
          </span>
          <button className={styles.logout} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
