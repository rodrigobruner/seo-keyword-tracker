import { Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import PagesScreen from './pages/PagesScreen';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignIn />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/pages" replace />} />
          <Route path="/pages" element={<PagesScreen />} />
          {/* page detail and add-client arrive in the next slice */}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/pages" replace />} />
    </Routes>
  );
}
