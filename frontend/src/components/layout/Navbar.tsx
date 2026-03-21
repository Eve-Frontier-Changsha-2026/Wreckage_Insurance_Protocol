import { NavLink } from 'react-router-dom';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/insure', label: 'Insure' },
  { to: '/claims', label: 'Claims' },
  { to: '/pool', label: 'LP Pool' },
  { to: '/salvage', label: 'Salvage' },
  { to: '/demo', label: 'Demo' },
] as const;

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-orange-400 text-lg tracking-tight">
            WIP
          </span>
          <div className="hidden md:flex items-center gap-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
        <ConnectButton />
      </div>
    </nav>
  );
}
