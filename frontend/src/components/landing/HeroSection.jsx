import { Arrow, LandingLink, Photo, SectionLabel } from "./LandingPrimitives";

export default function HeroSection() {
  return <section className="lp-hero" aria-labelledby="landing-title" id="top">
    <div className="lp-hero-image" data-hero-image><Photo name="terraces" alt="Sweeping green rice terraces in Bali, photographed by Tom Fisk" eager fetchpriority="high" srcSet="/images/landing/terraces-small.webp 900w, /images/landing/terraces.webp 1600w" sizes="100vw" width="1600" height="1067" /></div>
    <div className="lp-hero-shade" />
    <div className="lp-hero-topline"><SectionLabel light>Intelligent farm decision platform</SectionLabel><span className="lp-hero-edition">AGRICULTURE × TECHNOLOGY</span></div>
    <div className="lp-hero-copy" data-hero-copy>
      <h1 id="landing-title"><span className="lp-line"><span>Grow with data.</span></span><span className="lp-line"><span>Decide with</span></span><span className="lp-line lp-lime"><span>intelligence.</span></span></h1>
      <p>From the soil beneath your feet to the decisions ahead. Crop intelligence, plant health and a connected marketplace—in one place.</p>
      <div className="lp-actions"><LandingLink to="#features">Explore AgroSphere</LandingLink><LandingLink to="/register" secondary>Get started</LandingLink></div>
    </div>
    <div className="lp-field-marker" aria-hidden="true"><span /><div><small>FIELD NOTES / 01</small><strong>Nature provides the signals.<br />Intelligence connects them.</strong></div></div>
    <div className="lp-hero-bottom"><a href="#features" className="lp-scroll-link"><span className="lp-scroll-circle"><Arrow /></span>SCROLL TO DISCOVER</a><p>Built for the decisions<br />that shape a season.</p><span>01 — 05<br /><span className="lp-muted-light">A CONNECTED JOURNEY</span></span></div>
  </section>;
}
