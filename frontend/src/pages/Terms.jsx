import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

export default function Terms() {
  const h2 = { fontSize: 16, letterSpacing: 2, color: '#00ff66', marginTop: 28, marginBottom: 10, textTransform: 'uppercase' };
  const p = { fontSize: 14, color: '#cfe9d8', lineHeight: 1.7, marginBottom: 12 };

  return (
    <div style={{ maxWidth: 760, margin: 'clamp(20px, 5vw, 48px) auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Logo size={64} glow />
        </div>
        <h1 className="oswald glow-strong" style={{ fontSize: 26, color: '#00ff66', letterSpacing: 5 }}>
          TERMS OF SERVICE &amp; PRIVACY POLICY
        </h1>
        <p className="mono" style={{ color: '#6dba85', marginTop: 8, fontSize: 11, letterSpacing: 2 }}>
          [ LAST UPDATED: 2026-05-16 ]
        </p>
      </div>

      <div className="card">
        <p style={p}>
          Welcome to Revelator (the “Service”), an AI-assisted document forgery
          analysis tool. By creating an account or using the Service, you agree to
          these Terms of Service and Privacy Policy. If you do not agree, do not use
          the Service.
        </p>

        <h2 style={h2}>1. Use of the Service</h2>
        <p style={p}>
          Revelator provides automated, probabilistic assessments of document images.
          Results are advisory only and are not a substitute for professional forensic
          examination or legal advice. You are responsible for how you interpret and
          act on any verdict the Service produces.
        </p>

        <h2 style={h2}>2. Accounts &amp; Eligibility</h2>
        <p style={p}>
          You must provide a valid email address and confirm it before using the
          Service. You are responsible for keeping your credentials secure and for all
          activity under your account. You must not share your account or impersonate
          others.
        </p>

        <h2 style={h2}>3. Acceptable Use</h2>
        <p style={p}>
          You agree not to upload content you have no right to analyze, not to use the
          Service to create or refine forgeries, and not to attempt to disrupt,
          reverse-engineer, or gain unauthorized access to the Service or other users’
          data.
        </p>

        <h2 style={h2}>4. Documents You Upload</h2>
        <p style={p}>
          Images you submit are processed to generate an analysis and are stored as part
          of your scan history so you can review past results. Do not upload documents
          containing information you are not authorized to process. You retain ownership
          of your uploaded content.
        </p>

        <h2 style={h2}>5. Privacy &amp; Data We Store</h2>
        <p style={p}>
          We store your account details (email, username, name), your scan history and
          uploaded images, and, if you provide them, your own AI API keys, which are used
          solely to run your analyses. We do not sell your personal data. Analysis may be
          performed using third-party AI providers; by using the Service you consent to
          your uploaded images being transmitted to those providers for processing.
        </p>

        <h2 style={h2}>6. Email Communications</h2>
        <p style={p}>
          We send transactional emails such as account verification and security notices.
          These are required for the Service to function and are not marketing messages.
        </p>

        <h2 style={h2}>7. Data Retention &amp; Deletion</h2>
        <p style={p}>
          Your data is retained while your account is active. You may request deletion of
          your account and associated scan history; once deleted, this information cannot
          be recovered.
        </p>

        <h2 style={h2}>8. Disclaimer of Warranties</h2>
        <p style={p}>
          The Service is provided “as is” without warranties of any kind. We do not
          guarantee that any verdict is accurate, complete, or fit for a particular
          purpose. Absence of detected forgery is not proof of authenticity.
        </p>

        <h2 style={h2}>9. Limitation of Liability</h2>
        <p style={p}>
          To the maximum extent permitted by law, Revelator and its operators are not
          liable for any indirect, incidental, or consequential damages arising from your
          use of, or reliance on, the Service.
        </p>

        <h2 style={h2}>10. Changes to These Terms</h2>
        <p style={p}>
          We may update these Terms from time to time. Continued use of the Service after
          changes take effect constitutes acceptance of the revised Terms.
        </p>

        <h2 style={h2}>11. Contact</h2>
        <p style={p}>
          Questions about these Terms or your data can be directed to the Service
          operator.
        </p>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #112418', textAlign: 'center' }}>
          <Link to="/register" style={{ color: '#00ff66' }}>← Back to registration</Link>
        </div>
      </div>
    </div>
  );
}
