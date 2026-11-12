import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { IdeaDetailPage } from './pages/IdeaDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ShortlistPage } from './pages/ShortlistPage';
import { AppStoreProvider } from './state/AppStore';

export function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="idees/:ideaId" element={<IdeaDetailPage />} />
            <Route path="shortlist" element={<ShortlistPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  );
}
