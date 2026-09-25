import { Outlet, useLocation } from "react-router-dom";

import GeminiChatWidget from "../GeminiChatWidget";
import ScrollReveal from "../ui/ScrollReveal";
import TopNav from "./TopNav";

export default function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-hero-grid">
      <TopNav />

      <main className="ag-app-main mx-auto min-h-[calc(100vh-88px)] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ScrollReveal key={location.pathname} className="min-w-0">
          <Outlet />
        </ScrollReveal>
      </main>

      <GeminiChatWidget />
    </div>
  );
}
