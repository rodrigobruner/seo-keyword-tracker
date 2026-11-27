import { Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import PagesScreen from './pages/PagesScreen';
import PageDetail from './pages/PageDetail';
import AddClient from './pages/AddClient';
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
          <Route path="/pages/:id" element={<PageDetail />} />
          <Route path="/clients" element={<AddClient />} />
          <Route path="/clients/new" element={<Navigate to="/clients" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/pages" replace />} />
    </Routes>
  );
}
