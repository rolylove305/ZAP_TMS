import type { Metadata } from "next";

const appUrl = "https://app.zapdispatch.com";
const contactEmail = "rolando@zapdispatch.com";

export const metadata: Metadata = {
  title: "Privacy Policy | ZAP Dispatch",
  description: "Privacy Policy for Zap Dispatch LLC, including driver recruiting lead forms, communications, cookies, analytics, and U.S. privacy rights.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy | ZAP Dispatch",
    description: "How Zap Dispatch LLC collects, uses, and protects information submitted through our website, ads, and driver recruiting forms.",
    url: "/privacy-policy",
    type: "website",
  },
};

export default function PrivacyPolicy() {
  return (
    <main className="legal-page">
      <nav className="nav shell legal-nav" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ZAP Dispatch home">
          <img src="/zap-logo-dark.png" alt="ZAP Dispatch" />
        </a>
        <div className="nav-links">
          <a href="/#features">Features</a>
          <a href="/#for-you">Who it&apos;s for</a>
          <a href="/#pricing">Pricing</a>
        </div>
        <a className="button button-small button-outline" href={appUrl}>Log in</a>
      </nav>

      <section className="legal-hero shell">
        <p className="eyebrow-simple">Zap Dispatch LLC</p>
        <h1>Privacy Policy</h1>
        <p>
          This Privacy Policy explains how Zap Dispatch LLC collects, uses, shares, and protects personal information submitted through our website, lead forms, advertisements, driver recruiting communications, and related business services.
        </p>
        <span>Effective date: September 7, 2026</span>
      </section>

      <section className="legal-content shell" aria-label="Privacy Policy details">
        <article className="legal-section">
          <h2>Information We May Collect</h2>
          <p>
            We may collect information you provide directly, including your name, phone number, email address, location or state, CDL information, driving experience, employment or application information, and any other details you choose to submit when asking about driver opportunities or our services.
          </p>
          <p>
            We may also collect technical and usage information automatically, such as IP address, device type, browser type, pages visited, referring pages, approximate location derived from technical data, and website usage data.
          </p>
        </article>

        <article className="legal-section">
          <h2>How We Use Information</h2>
          <p>We may use personal information for the following purposes:</p>
          <ul>
            <li>Driver recruiting and application review.</li>
            <li>Communicating about driver opportunities, applications, or business services.</li>
            <li>Customer service, support, and follow-up.</li>
            <li>Business operations, recordkeeping, analytics, and improving our website and services.</li>
            <li>Fraud prevention, security, troubleshooting, and legal compliance.</li>
          </ul>
        </article>

        <article className="legal-section">
          <h2>Calls, Text Messages, and Email</h2>
          <p>
            If you submit your contact information, Zap Dispatch LLC or parties assisting with recruiting may contact you by phone call, SMS/text message, or email regarding driver opportunities, your application, or related business communications.
          </p>
          <p>
            Message and data rates may apply. Consent to receive text messages is not a condition of employment. You may opt out of marketing or recruiting text messages by replying STOP, or by contacting us using the email address below.
          </p>
        </article>

        <article className="legal-section">
          <h2>How We Share Information</h2>
          <p>
            We do not sell personal information. We may share information with service providers who help us operate our website, advertising, communications, analytics, recruiting, and business systems. We may also share information with carriers, employers, or recruiting partners involved in evaluating or responding to driver opportunities, and when required by law, legal process, safety, security, or to protect our rights.
          </p>
        </article>

        <article className="legal-section">
          <h2>Cookies and Analytics</h2>
          <p>
            Our website and advertising tools may use cookies, pixels, and similar technologies to understand website activity, measure advertising performance, improve user experience, and protect our services. You can control cookies through your browser settings, but some website features may not function properly if cookies are disabled.
          </p>
        </article>

        <article className="legal-section">
          <h2>Data Retention and Security</h2>
          <p>
            We retain personal information for as long as reasonably needed for recruiting, business operations, legal compliance, dispute resolution, security, and recordkeeping. We use reasonable administrative, technical, and organizational safeguards designed to protect personal information, but no internet or electronic storage system can be guaranteed to be completely secure.
          </p>
        </article>

        <article className="legal-section">
          <h2>Your Privacy Choices</h2>
          <p>
            You may request access to, correction of, or deletion of your personal information by contacting us. We may need to verify your identity before processing a request, and certain information may be retained when permitted or required by law.
          </p>
        </article>

        <article className="legal-section">
          <h2>U.S. State Privacy Rights</h2>
          <p>
            Depending on your state of residence and applicable law, you may have additional rights, including the right to know what personal information we collect, request correction or deletion, receive a copy of certain information, opt out of certain data uses, and appeal a privacy request decision. To exercise applicable rights, contact us using the email address below.
          </p>
        </article>

        <article className="legal-section">
          <h2>Children&apos;s Privacy</h2>
          <p>
            Our website, lead forms, recruiting, and services are not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information to us, please contact us so we can review and delete it when appropriate.
          </p>
        </article>

        <article className="legal-section">
          <h2>Policy Updates</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make changes, we will update the effective date on this page. Your continued use of the website or services after an update means the revised policy applies going forward.
          </p>
        </article>

        <article className="legal-section legal-contact">
          <h2>Contact Us</h2>
          <p>
            For privacy requests or questions about this Privacy Policy, contact Zap Dispatch LLC at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        </article>
      </section>

      <footer>
        <div className="shell footer-inner">
          <img src="/zap-icon-square.png" alt="ZAP Dispatch" />
          <p>Dispatch, tracking, and records for independent freight operations.</p>
          <div>
            <a href={appUrl}>Log in</a>
            <a href={`mailto:${contactEmail}`}>Contact</a>
            <a href="/privacy-policy">Privacy Policy</a>
          </div>
          <small>© 2026 ZAP Dispatch. All rights reserved.</small>
        </div>
      </footer>
    </main>
  );
}
