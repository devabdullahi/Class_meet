import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { StudyGroupsPage } from './StudyGroupsPage';
import { GroupDetailsPage } from './pages/GroupDetailsPage';
export function App(): ReactNode {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route path="/courses" element={<MyCoursesPage />} />
          <Route
  path="/groups/:courseId"
  element={<StudyGroupsPage />}
/>
<Route
  path="/groups/:courseId/:groupId"
  element={<GroupDetailsPage />}
/>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
