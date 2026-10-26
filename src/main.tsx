import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CheckPage } from "./pages/CheckPage";
import { CorpusPage } from "./pages/CorpusPage";
import { ExpiryPage } from "./pages/ExpiryPage";
import { Landing } from "./pages/Landing";
import { Legal } from "./pages/Legal";
import { PatentPage } from "./pages/PatentPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ScoutPage } from "./pages/ScoutPage";
import { SearchPage } from "./pages/SearchPage";
import "./styles.css";

function ScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollReset />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="check" replace />} />
          <Route path="check" element={<CheckPage />} />
          <Route path="expiry" element={<ExpiryPage />} />
          <Route path="scout" element={<ScoutPage />} />
          <Route path="research" element={<Navigate to="search" replace />} />
          <Route path="research/search" element={<SearchPage />} />
          <Route path="research/browse" element={<Navigate to="/app/research/search" replace />} />
          <Route path="research/corpus" element={<CorpusPage />} />
          <Route path="research/benchmark" element={<Navigate to="/app/research/search" replace />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="patents/:id" element={<PatentPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
