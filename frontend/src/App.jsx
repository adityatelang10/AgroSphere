import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import GuestRoute from "./components/routing/GuestRoute";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import OrdersPage from "./pages/customer/OrdersPage";
import CartPage from "./pages/customer/CartPage";
import FarmerCropsPage from "./pages/farmer/FarmerCropsPage";
import AddCropPage from "./pages/farmer/AddCropPage";
import CropRecommendationPage from "./pages/farmer/CropRecommendationPage";
import DiseaseDetectionPage from "./pages/farmer/DiseaseDetectionPage";
import SmartIrrigationPage from "./pages/farmer/SmartIrrigationPage";
import MarketIntelligencePage from "./pages/farmer/MarketIntelligencePage";
import DecisionEnginePage from "./pages/farmer/DecisionEnginePage";
import WhatIfSimulatorPage from "./pages/farmer/WhatIfSimulatorPage";
import FarmerDashboardPage from "./pages/farmer/FarmerDashboardPage";
import FarmerOrdersPage from "./pages/farmer/FarmerOrdersPage";
import FarmerProfilePage from "./pages/marketplace/FarmerProfilePage";
import CropDetailsPage from "./pages/marketplace/CropDetailsPage";
import MarketplacePage from "./pages/marketplace/MarketplacePage";
import ProfilePage from "./pages/profile/ProfilePage";
import NotFoundPage from "./pages/shared/NotFoundPage";
import PublicTraceabilityPage from "./pages/traceability/PublicTraceabilityPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/marketplace" replace />} />

        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/crop/:id" element={<CropDetailsPage />} />
        <Route path="/farmer/:id" element={<FarmerProfilePage />} />
        <Route path="/trace/:traceabilityId" element={<PublicTraceabilityPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["CUSTOMER"]} />}>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/cart" element={<CartPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["FARMER"]} />}>
          <Route path="/farmer/dashboard" element={<FarmerDashboardPage />} />
          <Route path="/farmer/crops" element={<FarmerCropsPage />} />
          <Route path="/farmer/crops/new" element={<AddCropPage />} />
          <Route path="/farmer/crop-recommendation" element={<CropRecommendationPage />} />
          <Route path="/farmer/disease-detection" element={<DiseaseDetectionPage />} />
          <Route path="/farmer/irrigation-advisor" element={<SmartIrrigationPage />} />
          <Route path="/farmer/market-intelligence" element={<MarketIntelligencePage />} />
          <Route path="/farmer/decision-engine" element={<DecisionEnginePage />} />
          <Route path="/farmer/what-if-simulator" element={<WhatIfSimulatorPage />} />
          <Route path="/farmer/orders" element={<FarmerOrdersPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
