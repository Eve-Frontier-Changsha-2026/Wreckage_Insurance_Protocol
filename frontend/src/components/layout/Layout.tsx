import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-gray-800 py-4 text-center text-sm text-gray-600">
        Wreckage Insurance Protocol — EVE Frontier
      </footer>
    </div>
  );
}
