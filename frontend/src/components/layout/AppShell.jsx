import { Outlet } from "react-router-dom";

import GeminiChatWidget from "../GeminiChatWidget";
import TopNav from "./TopNav";

export default function AppShell() {
  return (
    <div className="min-h-screen bg-hero-grid">
      <TopNav />

      <main className="mx-auto min-h-[calc(100vh-88px)] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <GeminiChatWidget />
    </div>
  );
}
