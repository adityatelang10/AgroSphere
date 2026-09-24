import { useEffect, useRef, useState } from "react";
import useLandingMotion from "../hooks/useLandingMotion";
import LandingNavbar from "../components/landing/LandingNavbar";
import HeroSection from "../components/landing/HeroSection";
import { ProblemSection, JourneySection, PlatformStatsSection } from "../components/landing/JourneySections";
import { CropIntelligenceSection, DiseaseSection, IrrigationSection } from "../components/landing/IntelligenceSections";
import DecisionEngineSection from "../components/landing/DecisionEngineSection";
import { MarketSection, MarketplaceSection, TraceabilitySection } from "../components/landing/CommerceSections";
import { UserTypesSection, FinalCTA, LandingFooter } from "../components/landing/ClosingSections";
import "../styles/landing.css";

export default function LandingPage() {
  const root = useRef(null);
  const [motionPaused, setMotionPaused] = useState(false);
  useLandingMotion(root, motionPaused);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "AgroSphere — Farm data. Better decisions.";
    return () => { document.title = previousTitle; };
  }, []);

  return <div ref={root} className="lp" data-landing-root>
    <a className="lp-skip-link" href="#landing-main">Skip to content</a>
    <div className="lp-scroll-progress" aria-hidden="true" />
    <div className="lp-cursor" aria-hidden="true"><span /></div>
    <LandingNavbar />
    <main id="landing-main" tabIndex={-1}>
      <HeroSection />
      <div className="lp-bridge" aria-label="Platform capabilities"><span>Farm data</span><span>AI analysis</span><span>Decision support</span><span>Marketplace</span><span>Traceability</span></div>
      <ProblemSection /><JourneySection /><PlatformStatsSection />
      <CropIntelligenceSection /><DiseaseSection /><IrrigationSection />
      <DecisionEngineSection /><MarketSection /><MarketplaceSection /><TraceabilitySection />
      <UserTypesSection /><FinalCTA />
    </main>
    <LandingFooter motionPaused={motionPaused} onToggleMotion={() => setMotionPaused((paused) => !paused)} />
  </div>;
}
