import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'sonner';
import { FileUp, BarChart3 } from 'lucide-react';
import Upload from './pages/Upload';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b bg-white">
          <div className="mx-auto max-w-6xl flex items-center gap-1 px-4 h-14">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900'
                }`
              }
            >
              <FileUp className="h-4 w-4" /> Upload
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900'
                }`
              }
            >
              <BarChart3 className="h-4 w-4" /> Dashboard
            </NavLink>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
