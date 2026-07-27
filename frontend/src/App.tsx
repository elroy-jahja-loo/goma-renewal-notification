import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { FileUp, BarChart3, LogOut } from 'lucide-react';
import { Button } from './components/ui/button';
import Upload from './pages/Upload';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('goma_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              localStorage.removeItem('goma_token');
              window.location.href = '/login';
            }}
          >
            <LogOut className="mr-1 h-4 w-4" /> Logout
          </Button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
