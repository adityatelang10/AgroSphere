import { Link } from "react-router-dom";
import { Arrow, LandingLink, Photo, SectionLabel, Wordmark } from "./LandingPrimitives";

export function UserTypesSection() {
  return <section className="lp-users" aria-label="Choose how to use AgroSphere"><div className="lp-user-farmer" data-reveal><SectionLabel light>For farmers</SectionLabel><h2>Your field.<br />Your next move.</h2><p>Plan. Analyze. Decide. List. Trace.<br />Bring your growing decisions and produce listings together.</p><LandingLink to="/register">Continue as Farmer</LandingLink><small>Choose FARMER in the existing registration form.</small></div><div className="lp-user-customer" data-reveal><SectionLabel>For customers</SectionLabel><h2>A closer connection<br />to your produce.</h2><p>Discover listings. Explore crop images.<br />Place test orders, follow their status and view public trace records.</p><LandingLink to="/register" secondary>Continue as Customer</LandingLink><small>Choose CUSTOMER in the existing registration form.</small></div></section>;
}

export function FinalCTA() {
  return <section className="lp-final"><Photo name="terraces" alt="" width="1920" height="1280" /><div className="lp-final-overlay" /><div className="lp-final-copy" data-reveal><SectionLabel light>Rooted in possibility</SectionLabel><h2>Better farming starts<br />with <span className="lp-lime">better decisions.</span></h2><div className="lp-actions"><LandingLink to="/login">Enter AgroSphere</LandingLink><LandingLink to="/marketplace" secondary>Explore Marketplace</LandingLink></div></div></section>;
}

export function LandingFooter({ motionPaused, onToggleMotion }) {
  return <footer id="about" className="lp-footer"><div className="lp-footer-top"><div><Wordmark /><p>Farm data. Connected intelligence.<br />A more considered next action.</p></div><nav aria-label="Footer navigation"><a href="#journey">How it works</a><a href="#intelligence">AI & intelligence</a><a href="#decision-engine">Decision support</a><Link to="/marketplace">Marketplace</Link><a href="#traceability">Traceability</a><Link to="/login">Login</Link></nav></div><div className="lp-footer-word" aria-hidden="true">AgroSphere.</div><div className="lp-footer-bottom"><span>Decision support. Always human-led.</span><button onClick={onToggleMotion} aria-pressed={motionPaused}>{motionPaused ? "Resume motion" : "Pause motion"}</button><a href="/credits/ASSET_CREDITS.md" target="_blank" rel="noreferrer">Photography credits <Arrow diagonal /></a><a href="#top">Back to top ↑</a></div></footer>;
}
