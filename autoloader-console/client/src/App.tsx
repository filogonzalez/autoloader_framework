import { createBrowserRouter, RouterProvider, Outlet } from 'react-router';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@databricks/appkit-ui/react';
import { LanguageProvider } from './i18n/LanguageProvider';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewPage } from './pages/OverviewPage';
import { OperationsPage } from './pages/OperationsPage';
import { DetailPage } from './pages/DetailPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ObservabilityPage } from './pages/ObservabilityPage';

function Layout() {
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r md:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar (drawer) — only mounted on small screens, so it closes on resize. */}
      {isMobile && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/operations', element: <OperationsPage /> },
      { path: '/detail', element: <DetailPage /> },
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/observability', element: <ObservabilityPage /> },
    ],
  },
]);

export default function App() {
  return (
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>
  );
}
