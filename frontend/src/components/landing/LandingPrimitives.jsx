import { Link } from "react-router-dom";

export function Arrow({ diagonal = false, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" {...props}><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-6-6 6 6-6 6"} /></svg>;
}

export function Mark() {
  return <svg className="lp-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 30V14M18 23C7 23 5 15 5 6c10 0 13 7 13 17Zm0-5C18 8 25 5 32 5c0 9-5 13-14 13Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export function Wordmark() {
  return <Link className="lp-wordmark" to="/" aria-label="AgroSphere home"><Mark /><span>AgroSphere<span className="lp-brand-dot">.</span></span></Link>;
}

export function SectionLabel({ number, children, light = false }) {
  return <p className={`lp-eyebrow${light ? " lp-eyebrow-light" : ""}`}><span className="lp-dot" />{number ? <span>{number} /</span> : null}{children}</p>;
}

export function LandingLink({ to, children, secondary = false, className = "" }) {
  const props = { className: `lp-button ${secondary ? "lp-button-outline" : "lp-button-solid"} ${className}`, "data-magnetic": "" };
  return to.startsWith("#")
    ? <a href={to} {...props}>{children}<Arrow diagonal /></a>
    : <Link to={to} {...props}>{children}<Arrow diagonal /></Link>;
}

export function Photo({ name, alt, className = "", eager = false, ...props }) {
  return <img src={`/images/landing/${name}.webp`} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" {...props} />;
}

export function SampleLabel({ children = "Illustrative demo · not live data" }) {
  return <p className="lp-sample-label"><span />{children}</p>;
}
