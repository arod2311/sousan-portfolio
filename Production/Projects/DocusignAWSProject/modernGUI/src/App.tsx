import { NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Operations } from './pages/Operations';
import { Contracts } from './pages/Contracts';
import { DriverBoard } from './pages/DriverBoard';
import { SalesBoard } from './pages/SalesBoard';

function Navigation() {
  const items = [
    { to: '/', label: 'Overview' },
    { to: '/operations', label: 'Operations' },
    { to: '/sales', label: 'Sales' },
    { to: '/contracts', label: 'Contracts' },
    { to: '/drivers', label: 'Driver Board' }
  ];
  return (
    <nav>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'active' : undefined)}
          end={item.to === '/'}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-lockup">
          <img src="/logos/logo_yellow_letters.png" alt="Southern Sanitation" />
          <h1>Service Slip Portal</h1>
        </div>
        <Navigation />
      </aside>
      <main className="main-panel">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/sales" element={<SalesBoard />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/drivers" element={<DriverBoard />} />
        </Routes>
      </main>
    </div>
  );
}
