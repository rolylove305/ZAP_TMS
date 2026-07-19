const appUrl = "https://app.zapdispatch.com";

const screenshots = [
  { src: "/screenshot-2026-07-18-at-6.19.31-pm.png", alt: "Dashboard" },
  { src: "/screenshot-2026-07-18-at-6.19.43-pm.png", alt: "Driver HOS" },
  { src: "/screenshot-2026-07-18-at-6.19.52-pm.png", alt: "Fleet Tracking" },
  { src: "/screenshot-2026-07-18-at-6.20.03-pm.png", alt: "Load Details" },
  { src: "/screenshot-2026-07-18-at-6.20.10-pm.png", alt: "Load Form" },
  { src: "/screenshot-2026-07-18-at-6.20.19-pm.png", alt: "Fleet Management" },
];

const trustedCarriers = [
  {
    name: "MRR United",
    specialization: "Dry Van & Reefer",
    weekly: "$10k+",
    region: "Midwest to Northeast",
  },
  {
    name: "Estrella Trucking",
    specialization: "Reefer & Flatbed",
    weekly: "$10k+",
    region: "Midwest to Northeast",
  },
  {
    name: "Noah Freight",
    specialization: "Long Haul Specialized",
    weekly: "$10k+",
    region: "Midwest to Northeast",
  },
];

const features = [
  {
    number: "01",
    title: "Dispatch board",
    copy: "Create loads, assign drivers and equipment, manage stops, and move every shipment from booked to paid.",
  },
  {
    number: "02",
    title: "Live fleet visibility",
    copy: "See trucks on one map, review driver HOS clocks, and connect supported ELD providers without switching systems.",
  },
  {
    number: "03",
    title: "Driver workflow",
    copy: "Send a secure driver link for load details, status updates, current location, BOLs, and PODs.",
  },
  {
    number: "04",
    title: "Documents & AI",
    copy: "Keep load documents organized and turn Rate Confirmations into draft loads with AI-assisted data entry.",
  },
  {
    number: "05",
    title: "Invoices & revenue",
    copy: "Track gross revenue, dispatcher commission, business costs, invoices, and payment status in one place.",
  },
  {
    number: "06",
    title: "Private by design",
    copy: "Every subscription is an independent account. Your carriers, loads, documents, and financial records stay yours.",
  },
];

const faqs = [
  {
    question: "Do I need a credit card to start?",
    answer: "No. Start with full access for 30 days. Subscribe only when you are ready to continue.",
  },
  {
    question: "Is ZAP TMS for dispatchers or carriers?",
    answer: "Both. Independent dispatchers can manage multiple carrier records, while carriers can run their own private operation in a separate account.",
  },
  {
    question: "Can I connect my ELD or tracking system?",
    answer: "Yes. ZAP supports Apollo ELD, Next Fleet, and other leading ELD providers. Connect directly without switching systems.",
  },
  {
    question: "How does the Rate Confirmation AI work?",
    answer: "Upload a PDF rate confirmation and ZAP uses Google Gemini AI to extract load details—rate, dates, addresses, equipment. It auto-fills your load form in seconds.",
  },
  {
    question: "Is my data private? Can other dispatchers see my loads?",
    answer: "Completely private. Every account is independent. Your carriers, loads, invoices, and financial records are 100% yours. No one else can access them.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Month-to-month subscription. Cancel anytime from your billing portal. No long contracts.",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="ZAP Dispatch home">
          <img src="/zap-logo-dark.png" alt="ZAP Dispatch" />
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#for-you">Who it’s for</a>
          <a href="#pricing">Pricing</a>
        </div>
        <a className="button button-small button-outline" href={appUrl}>Log in</a>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Built for real freight operations</div>
          <h1>Run dispatch.<br />Track every load.<br /><em>Stay in control.</em></h1>
          <p className="hero-lead">
            One focused TMS for independent dispatchers and small carriers—loads, drivers, documents, tracking, HOS, and invoices in one place.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={appUrl}>Start free for 30 days <span>↗</span></a>
            <a className="text-link" href="#features">Explore the platform <span>↓</span></a>
          </div>
          <div className="hero-trust" aria-label="Trial details">
            <span>✓ No credit card required</span>
            <span>✓ Cancel anytime</span>
            <span>✓ Your data stays private</span>
          </div>
        </div>

        <div className="product-stage" aria-label="ZAP Dispatch TMS dashboard preview">
          <div className="stage-glow" />
          <div className="dashboard-card">
            <div className="dash-top">
              <div>
                <span className="dash-kicker">LIVE OPERATIONS</span>
                <strong>Fleet command</strong>
              </div>
              <span className="live-pill"><i /> LIVE</span>
            </div>
            <div className="metrics">
              <div><small>Active loads</small><b>12</b><span>+3 today</span></div>
              <div><small>In transit</small><b>8</b><span>On schedule</span></div>
              <div><small>Weekly gross</small><b>$28.4k</b><span>↑ 14.2%</span></div>
            </div>
            <div className="map-panel">
              <div className="map-grid" />
              <div className="route route-one" />
              <div className="route route-two" />
              <span className="truck-dot dot-one">20</span>
              <span className="truck-dot dot-two">03</span>
              <span className="truck-dot dot-three">01</span>
              <div className="map-label"><i /> 3 trucks moving</div>
            </div>
            <div className="load-row">
              <span className="load-icon">↗</span>
              <div><b>Load #1475751</b><small>Lake City, PA → Butner, NC</small></div>
              <span className="status-pill">IN TRANSIT</span>
            </div>
          </div>
          <div className="floating-card hos-card">
            <small>DRIVE REMAINING</small>
            <div className="clock"><span>6:54</span></div>
          </div>
          <div className="floating-card doc-card">
            <span className="doc-icon">✓</span>
            <div><b>POD received</b><small>Uploaded by driver</small></div>
          </div>
        </div>
      </section>

      <section className="proof-bar">
        <div className="shell proof-inner">
          <span>LOAD MANAGEMENT</span><i />
          <span>LIVE TRACKING</span><i />
          <span>DRIVER HOS</span><i />
          <span>DOCUMENTS</span><i />
          <span>INVOICING</span>
        </div>
      </section>

      <section className="trusted-section">
        <div className="shell">
          <div className="trusted-intro">
            <p className="eyebrow-simple">Proven by real operations</p>
            <h2>Built by 25 years of freight experience.</h2>
            <p>Driver. Owner-operator. Dispatcher. I've done the work and know what slows you down. ZAP TMS replaces the chaos—manage carriers running $10k+ weekly, track every load in real-time, and keep your operation lean. No complexity. No setup headache. <strong>Just dispatch.</strong></p>
            <a className="button button-primary" href={appUrl} style={{marginTop: "28px"}}>Start your free trial <span>↗</span></a>
          </div>
          <div className="trusted-grid">
            {trustedCarriers.map((carrier) => (
              <article className="trusted-card" key={carrier.name}>
                <div className="carrier-badge">{carrier.name.split(" ").map((word) => word[0]).join("")}</div>
                <h3>{carrier.name}</h3>
                <p className="specialization">{carrier.specialization}</p>
                <div className="carrier-metrics">
                  <span className="metric"><b>{carrier.weekly}</b> weekly gross</span>
                  <span className="metric">{carrier.region}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="screenshots-section">
        <div className="shell">
          <div className="section-heading" style={{marginBottom: "42px"}}>
            <div><span className="section-number">Aa</span><span className="section-rule" /></div>
            <div>
              <p className="eyebrow-simple">See it in action</p>
              <h2>Real operations.<br />Real interface.</h2>
            </div>
            <p>From dispatch board to driver HOS, fleet tracking to invoicing—everything in one place.</p>
          </div>
          <div className="screenshots-grid">
            <img src="/screenshot-2026-07-18-at-6.19.31-pm.png" alt="Dashboard" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.19.43-pm.png" alt="Driver HOS" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.19.52-pm.png" alt="Fleet Tracking" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.20.03-pm.png" alt="Load Details" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.20.10-pm.png" alt="Load Form" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.20.19-pm.png" alt="Load Board" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.20.25-pm.png" alt="Fleet Management" className="screenshot" />
            <img src="/screenshot-2026-07-18-at-6.20.39-pm.png" alt="More Views" className="screenshot" />
          </div>
        </div>
      </section>

      <section className="section shell" id="features">
        <div className="section-heading">
          <div><span className="section-number">01</span><span className="section-rule" /></div>
          <div>
            <p className="eyebrow-simple">Everything connected</p>
            <h2>Less chasing.<br />More dispatching.</h2>
          </div>
          <p>ZAP TMS replaces scattered spreadsheets, messages, and paperwork with one clear operating view.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span>{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="audience-section" id="for-you">
        <div className="shell">
          <div className="section-heading audience-heading">
            <div><span className="section-number">02</span><span className="section-rule" /></div>
            <div>
              <p className="eyebrow-simple">Made for the way you work</p>
              <h2>One platform.<br />Your private operation.</h2>
            </div>
            <p>Choose the workflow that fits your business. Every account remains independent and protected.</p>
          </div>
          <div className="audience-grid">
            <article className="audience-card audience-dispatcher">
              <span className="audience-tag">FOR DISPATCHERS</span>
              <h3>Manage every carrier<br />without losing the thread.</h3>
              <p>Track loads, drivers, documents, commissions, invoices, and live fleet activity across the carriers you serve.</p>
              <ul>
                <li><span>✓</span> Multiple carrier records</li>
                <li><span>✓</span> Commission visibility</li>
                <li><span>✓</span> Driver links and documents</li>
              </ul>
            </article>
            <article className="audience-card audience-carrier">
              <span className="audience-tag">FOR CARRIERS</span>
              <h3>Keep your fleet records<br />moving with your trucks.</h3>
              <p>Run loads, monitor drivers, store paperwork, review HOS, and keep payment records inside your own private account.</p>
              <ul>
                <li><span>✓</span> Private company workspace</li>
                <li><span>✓</span> ELD and HOS visibility</li>
                <li><span>✓</span> Load and payment history</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section shell workflow-section">
        <div className="section-heading">
          <div><span className="section-number">03</span><span className="section-rule" /></div>
          <div>
            <p className="eyebrow-simple">Start without the setup headache</p>
            <h2>From signup to<br />first load in minutes.</h2>
          </div>
          <p>No long implementation cycle. Start simple and add drivers, carriers, and ELD connections as you grow.</p>
        </div>
        <div className="steps">
          <article><b>1</b><h3>Create your account</h3><p>Enter your email and confirm it to activate your free trial.</p></article>
          <article><b>2</b><h3>Set up your operation</h3><p>Add your company, carriers, drivers, or equipment.</p></article>
          <article><b>3</b><h3>Dispatch your first load</h3><p>Track the load from booking through delivery and payment.</p></article>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="pricing-glow" />
        <div className="shell pricing-inner">
          <div className="pricing-copy">
            <span className="founder-pill">FOUNDING PLAN</span>
            <h2>Serious tools.<br /><em>Simple price.</em></h2>
            <p>Full access to ZAP Dispatch TMS for one independent business account.</p>
          </div>
          <div className="price-card">
            <span>FULL PLATFORM ACCESS</span>
            <div className="price"><sup>$</sup><b>29</b><div><strong>.99</strong><small>/ month</small></div></div>
            <p>Start with 30 days free. No credit card required.</p>
            <ul>
              <li>✓ Unlimited load records</li>
              <li>✓ Dispatch, tracking, HOS, and map</li>
              <li>✓ Driver portal and documents</li>
              <li>✓ Invoices and revenue tracking</li>
              <li>✓ AI-assisted Rate Con import</li>
            </ul>
            <a className="button button-primary price-button" href={appUrl}>Start my free trial <span>↗</span></a>
            <small>Month to month. Cancel anytime.</small>
          </div>
        </div>
      </section>

      <section className="section shell faq-section">
        <div className="faq-title">
          <p className="eyebrow-simple">Questions, answered</p>
          <h2>Before you start.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <details key={faq.question} open={index === 0}>
              <summary>{faq.question}<span>+</span></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="final-cta shell">
        <div>
          <p className="eyebrow-simple">Your next load starts here</p>
          <h2>Bring your dispatch<br />operation into focus.</h2>
        </div>
        <a className="button button-light" href={appUrl}>Start free for 30 days <span>↗</span></a>
      </section>

      <footer>
        <div className="shell footer-inner">
          <img src="/zap-logo-dark.png" alt="ZAP Dispatch" />
          <p>Dispatch, tracking, and records for independent freight operations.</p>
          <div>
            <a href={appUrl}>Log in</a>
            <a href="mailto:rolando@zapdispatch.com">Contact</a>
          </div>
          <small>© 2026 ZAP Dispatch. All rights reserved.</small>
        </div>
      </footer>
    </main>
  );
}
