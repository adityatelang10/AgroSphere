import { LandingLink, Mark, SampleLabel, SectionLabel } from "./LandingPrimitives";

export default function DecisionEngineSection() {
  return <section id="decision-engine" className="lp-section lp-decision">
    <div className="lp-decision-heading" data-reveal><SectionLabel number="06" light>The AgroSphere contribution</SectionLabel><h2>Many signals.<br /><span className="lp-lime">One next action.</span></h2><p>The Farm Decision Engine connects current evidence with the farmer’s real situation to prioritize what should happen next.</p></div>
    <div className="lp-evidence-map" data-reveal aria-label="Relevant evidence connects to the AgroSphere Decision Engine">
      <svg className="lp-evidence-lines" viewBox="0 0 1000 400" preserveAspectRatio="none" fill="none" aria-hidden="true"><g><path d="M150 60H320Q365 60 365 115V155Q365 200 500 200" /><path d="M150 200H500" /><path d="M150 340H320Q365 340 365 285V245Q365 200 500 200" /><path d="M850 60H680Q635 60 635 115V155Q635 200 500 200" /><path d="M850 200H500" /><path d="M850 340H680Q635 340 635 285V245Q635 200 500 200" /><path d="M500 200V400" /></g></svg>
      <div className="lp-evidence-column"><div><small>01 / PLANNING</small><strong>Crop recommendation</strong></div><div><small>02 / PLANT HEALTH</small><strong>Disease evidence</strong></div><div><small>03 / WATER</small><strong>Irrigation evidence</strong></div></div>
      <div className="lp-engine-core"><span className="lp-engine-orbit" aria-hidden="true" /><Mark /><span>AGROSPHERE</span><strong>Decision<br />Engine</strong><small>decision-v1</small></div>
      <div className="lp-evidence-column"><div><small>04 / CURRENT CROP</small><strong>Inventory</strong></div><div><small>05 / REPORTED DATA</small><strong>Market evidence</strong></div><div><small>06 / REAL CONSTRAINTS</small><strong>Farmer context</strong></div></div>
    </div>
    <div className="lp-next-action" data-reveal><div><SampleLabel>Illustrative Tomato decision</SampleLabel><h3>Plan irrigation soon.</h3><span className="lp-action-code">IRRIGATE_SOON</span></div><div className="lp-priority"><small>PRIORITY SCORE</small><strong><span data-count="100">100</span><span> / 100</span></strong><p>Deterministic ranking.<br />Not probability or confidence.</p></div></div>
    <div className="lp-decision-foot"><p>Relevant, fresh evidence matters. Crop Advisor is planning support; a Maize recommendation does not replace an existing Tomato crop. Historical market trends are not a current price forecast.</p><LandingLink to="/farmer/decision-engine">Explore Farm Decision</LandingLink></div>
  </section>;
}
