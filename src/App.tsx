import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Lazy load pages — ProjectorPage is a separate screen, no need to load with main app
const Index = lazy(() => import("./pages/Index.tsx"));
const CockpitPage = lazy(() => import("./pages/CockpitPage.tsx"));
const ProjectorPage = lazy(() => import("./pages/ProjectorPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Loading fallback — minimal spinner for initial page load
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Ładowanie...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus — parish app is often alt-tabbed
      refetchOnWindowFocus: false,
      // Keep data fresh for 2 minutes before refetching
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Only retry once on failure
      retry: 1,
      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/cockpit" element={<CockpitPage />} />
            <Route path="/projector-screen" element={<ProjectorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
