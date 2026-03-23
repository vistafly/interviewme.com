import { X } from 'lucide-react';
import { tokens } from '../styles/tokens';

export default function PrivacyPage({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.color.surface,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: 12,
          padding: '28px 32px',
          width: '100%',
          maxWidth: 580,
          maxHeight: '80vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tokens.color.textMuted,
            padding: 4,
            display: 'flex',
          }}
        >
          <X size={18} />
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 600, color: tokens.color.text, marginBottom: 20, marginTop: 0 }}>
          Privacy Policy
        </h2>
        <p style={{ fontSize: 11, color: tokens.color.textMuted, marginBottom: 20 }}>
          Last updated: March 2026
        </p>

        <Section title="What we collect">
          When you complete an interview session, InterviewMe stores <strong>anonymized performance metrics</strong> — numerical scores such as vocabulary richness, clarity, depth, and structure — along with the AI-assigned grade for that answer. We do <strong>not</strong> store your answer text, audio recordings, or any personally identifiable content beyond what Firebase Authentication uses for login (email address).
        </Section>

        <Section title="Why we collect it">
          These anonymized score pairs are used to improve the accuracy of our heuristic grading model through statistical calibration. By comparing local scores to AI-assigned grades, we can tune the algorithm to be more accurate across different job types and answer styles.
        </Section>

        <Section title="How data is stored">
          Metrics are stored in Google Firebase Firestore (Google Cloud infrastructure). Records contain no names, no text content, and no audio. Each record is a set of numbers tied to a question type and job category.
        </Section>

        <Section title="Data retention">
          Anonymized training records are retained indefinitely to support ongoing calibration. Because records contain no PII, there is no personal data to expire.
        </Section>

        <Section title="Your rights (GDPR / CalOPPA)">
          If you are located in the EU or California and wish to request deletion of any data associated with your account, please contact us at <span style={{ color: tokens.color.accent }}>privacy@interviewme.com</span>. We will process erasure requests within 30 days.
        </Section>

        <Section title="Third-party services">
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Firebase / Google Cloud — authentication and data storage</li>
            <li>Anthropic (Claude API) — AI grading and question generation</li>
            <li>Stripe — payment processing (Pro plan)</li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          We may update this policy as the product evolves. Continued use of InterviewMe after changes constitutes acceptance of the updated policy.
        </Section>

        <p style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${tokens.color.border}` }}>
          By using InterviewMe you agree to this Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: tokens.color.text, marginBottom: 6, marginTop: 0 }}>
        {title}
      </h3>
      <p style={{ fontSize: 13, color: tokens.color.textSecondary, lineHeight: 1.6, margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
