import { Arrow, Photo, SectionLabel } from "./LandingPrimitives";

export const journeyStages = [
  { title: "Farm data", detail: "Start with the ground truth.", body: "Bring soil, climate, crop and farmer context into the picture.", tags: "SOIL / CLIMATE / CONTEXT" },
  { title: "AI analysis", detail: "Give the signals meaning.", body: "Explore ranked crop recommendations and supported leaf-condition predictions.", tags: "CROP ADVISOR / LEAF SCANNER" },
  { title: "Decision support", detail: "Find the next useful action.", body: "Combine relevant evidence with practical constraints—not just isolated predictions.", tags: "EVIDENCE / PRIORITY / EXPLANATION" },
  { title: "Marketplace", detail: "Bring the harvest to people.", body: "Publish produce, share detailed images and connect listings with customers.", tags: "LISTINGS / GALLERY / ORDERS" },
  { title: "Traceability", detail: "Keep the listing connected.", body: "Open recorded crop and origin information through a public, QR-accessible page.", tags: "TRACE ID / PUBLIC CROP RECORD" },
];

export function ProblemSection() {
  return <section id="features" className="lp-section lp-problem">
    <SectionLabel number="01">A clearer picture</SectionLabel>
    <div className="lp-problem-grid">
      <div data-reveal><h2>Farming decisions<br />shouldn’t depend on<br /><span className="lp-soft">scattered information.</span></h2><p className="lp-body">A crop, a leaf, a weather report, a market price. Each tells part of the story. AgroSphere helps you see how they fit together.</p></div>
      <div className="lp-questions">{["What should I grow?", "Is my crop healthy?", "Does it need water?", "What is the market reporting?", "What should I do next?"].map((question, index) => <div key={question} data-reveal style={{ "--reveal-delay": `${index * 50}ms` }}><span>0{index + 1}</span><p>{question}</p><Arrow diagonal /></div>)}</div>
    </div>
  </section>;
}

export function JourneySection() {
  return <section id="journey" className="lp-journey lp-section" data-journey>
    <div className="lp-journey-sticky"><SectionLabel number="02" light>The connected journey</SectionLabel><h2 data-reveal>Not another tool.<br /><span className="lp-lime">A connected<br />way forward.</span></h2><p className="lp-body">Five stages. One platform.<br />From understanding your field to sharing your harvest.</p><div className="lp-journey-photo"><Photo name="fields" alt="Aerial view of cultivated green fields beside woodland" width="1100" height="730" /><span>FROM FIELD TO NEXT ACTION <Arrow diagonal /></span></div></div>
    <ol className="lp-journey-steps">{journeyStages.map((stage, index) => <li key={stage.title} data-journey-step data-reveal><span className="lp-stage-number">0{index + 1}</span><div><p className="lp-eyebrow">{stage.title}</p><h3>{stage.detail}</h3><p>{stage.body}</p><small>{stage.tags}</small></div></li>)}</ol>
  </section>;
}

export function PlatformStatsSection() {
  return <section className="lp-stats" aria-label="Platform scope">{[[22, "Crop Advisor classes"], [15, "Supported leaf classes"], [7, "Crop planning inputs"], [5, "Connected journey stages"]].map(([value, label]) => <div key={label} data-reveal><strong data-count={value}>{value}</strong><span>{label}</span></div>)}</section>;
}
