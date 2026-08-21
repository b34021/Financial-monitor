import { NavLink, Outlet } from 'react-router-dom';

/**
 * Application shell: a top navigation bar between the simulator (/add) and the
 * live dashboard (/monitor), plus the routed page outlet below it.
 */
export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <span className="nav__brand">RTM Monitor</span>
        <div className="nav__links">
          <NavLink to="/add" className={({ isActive }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}>
            Simulator
          </NavLink>
          <NavLink
            to="/monitor"
            className={({ isActive }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
          >
            Live dashboard
          </NavLink>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
