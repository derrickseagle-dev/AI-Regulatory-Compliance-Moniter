/**
 * Sample demo documents for seeding beta tenants.
 * Each contains realistic compliance-relevant content designed to
 * trigger pattern-based rules for immediate demo value.
 */

export interface SampleDocument {
  filename: string;
  content: string;
  type: "txt";
  category: string;
}

export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  // ── 1. Q4 Earnings Call Script ─────────────────────────────
  {
    filename: "Q4_Earnings_Call_Script.txt",
    type: "txt",
    category: "earnings",
    content: `Q4 2025 EARNINGS CALL SCRIPT
CONFIDENTIAL — INTERNAL USE ONLY

Prepared for: Jane Morgan, CEO
Date: January 15, 2026

Good morning everyone, and thank you for joining our Q4 2025 earnings call.

I'm thrilled to report that Regula AI expects record-breaking results this quarter. Our revenue projects to exceed $50 million, which would represent a 340% increase year-over-year. We believe this trajectory will continue and anticipate revenue growth of at least 200% for the full fiscal year 2026.

Our customer acquisition has been nothing short of extraordinary. We're forecasting 10,000 new enterprise customers by Q2 2026 — a number that we are completely confident in achieving. The pipeline is bulletproof.

I can promise our investors that Regula AI will dominate the compliance monitoring space. There is simply no downside to our strategy. Our technology is 100% safe, and we guarantee that every customer will see ROI within 30 days of deployment. This is a sure thing.

Key metrics:
- Q4 Revenue: $48.2M (estimated)
- New customers: 3,400 (estimated)
- Net retention: 145%
- Gross margin: 82%

Our outlook for 2026 is exceptionally strong. We forecast $200-250M in annual recurring revenue with no risk of slowdown. The AI compliance market is ours to take.

Thank you for your continued support. We'll now open the floor for questions.

— END OF SCRIPT —`,
  },

  // ── 2. Patient Intake Form ─────────────────────────────────
  {
    filename: "Patient_Intake_Form.txt",
    type: "txt",
    category: "hipaa",
    content: `PATIENT INTAKE FORM
Northwell Medical Center — Department of Oncology

PATIENT INFORMATION:
Patient Name: Sarah J. Mitchell
Date of Birth: 03/14/1968
SSN: 482-71-9056
MRN: MRN# 8273641
Health Plan ID: HPID: BENEF-MTCH-48291
Policy Number: NWMC-99827-B

Contact:
Email: sarah.mitchell@personal.com
Phone: (917) 555-0182
Address: 72 West 85th Street, New York, NY 10024

MEDICAL HISTORY:
Diagnosis Date: November 12, 2024
Primary Condition: Metastatic breast cancer (Stage III)
Treating Physician: Dr. Rebecca Chen, MD
Insurance ID: BCBS-NY-88261

TREATMENT RECORD:
Date of Service: January 5, 2026
Admission Date: January 5, 2026
Discharge Date: January 7, 2026
Procedure: Chemotherapy infusion — Paclitaxel 175mg/m²
Treatment Date: January 5, 2026

ADDITIONAL NOTES:
Patient DOB verified against insurance records. SSN collected for billing purposes.
Medical record MRN# 8273641 has been updated with latest treatment information.
Health record forwarded to primary care physician Dr. James Okafor at Westside Medical Group.

Patient reports mild nausea and fatigue following prior infusion on December 15, 2025.
Social security number on file matches insurance records.

— END OF INTAKE FORM —`,
  },

  // ── 3. Marketing Email Draft ───────────────────────────────
  {
    filename: "Marketing_Email_Draft.txt",
    type: "txt",
    category: "marketing",
    content: `SUBJECT: Your portfolio could triple with Regula AI — guaranteed returns ahead!

DO NOT DISTRIBUTE — Marketing Review Pending

Dear Valued Investor,

Are you tired of mediocre returns? With Regula AI's compliance monitoring platform, we guarantee you'll see 300% ROI within your first quarter. Our clients have NEVER lost money using our system — it's completely risk-free.

Don't miss out on this limited-time opportunity. Act now — this offer expires soon and won't be available again. Last chance to secure guaranteed profits with zero risk exposure.

Here's what our platform delivers:
• 100% safe investment compliance monitoring — can't lose
• Guaranteed returns of at least 200% on your compliance investment
• Foolproof AI that always wins against regulatory challenges
• Bulletproof protection against SEC, FINRA, and GDPR penalties

Our data shows that 97% of our clients achieve complete compliance within just 7 days. Without exception, every single one of our enterprise customers has renewed their contracts. We promise you'll never face a regulatory fine again.

Hurry — this offer is only available today. We will certainly deliver results that exceed your expectations.

Warm regards,
The Regula AI Sales Team

P.S. Don't wait — the compliance revolution is here, and you'll regret missing out on this guaranteed opportunity.

— END OF DRAFT —`,
  },
];
