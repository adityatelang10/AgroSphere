import { Link } from "react-router-dom";
import "../../styles/navigation.css";

export function BrandMark({ className = "" }) {
  return <svg className={`ag-brand-mark ${className}`} viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 30V14M18 23C7 23 5 15 5 6c10 0 13 7 13 17Zm0-5C18 8 25 5 32 5c0 9-5 13-14 13Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export default function NavbarBrand({ to = "/", className = "" }) {
  return <Link className={`ag-brand ${className}`} to={to} aria-label={to === "/" ? "AgroSphere home" : "AgroSphere marketplace"}><BrandMark /><span>AgroSphere<span className="ag-brand-dot">.</span></span></Link>;
}
