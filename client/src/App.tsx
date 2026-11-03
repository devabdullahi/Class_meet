import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { StudyGroupsPage } from './pages/StudyGroupsPage';
import { GroupDetailsPage } from './pages/GroupDetailsPage';
import { CreateGroupPage } from './pages/CreateGroupPage';
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
                <MyCoursesPage />
              </RequireAuth>
            }
          />
          <Route path="/courses" element={<Navigate to="/" replace />} />
          <Route
  path="/groups/:courseId"
  element={<StudyGroupsPage />}
/>
<Route
  path="/groups/:courseId/:groupId"
  element={<GroupDetailsPage />}
/>
          <Route
            path="/groups/create"
            element={
              <RequireAuth>
                <CreateGroupPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
