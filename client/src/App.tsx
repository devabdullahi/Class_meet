import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { MyGroupsPage } from './pages/MyGroupsPage';
import { PendingRequestsProvider } from './pending-requests/PendingRequestsProvider';
import { StudyGroupsPage } from './pages/StudyGroupsPage';
import { GroupDetailsPage } from './pages/GroupDetailsPage';
import { CreateGroupPage } from './pages/CreateGroupPage';
import { EditGroupPage } from './pages/EditGroupPage';
import { ProfilePage } from './pages/ProfilePage';
export function App(): ReactNode {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PendingRequestsProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><MyCoursesPage /></RequireAuth>} />
            <Route path="/courses" element={<Navigate to="/" replace />} />
            <Route path="/my-groups" element={<RequireAuth><MyGroupsPage /></RequireAuth>} />
            <Route path="/groups/create" element={<RequireAuth><CreateGroupPage /></RequireAuth>} />
            <Route path="/groups/:courseId" element={<RequireAuth><StudyGroupsPage /></RequireAuth>} />
            <Route
              path="/groups/:courseId/:groupId"
              element={<RequireAuth><GroupDetailsPage /></RequireAuth>}
            />
            <Route
              path="/groups/:courseId/:groupId/edit"
              element={<RequireAuth><EditGroupPage /></RequireAuth>}
            />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PendingRequestsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
