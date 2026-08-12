const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Set via: firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const ALERT_TO = "john@mchsproperties.com";
// Resend requires the "from" address to be on a domain you've verified with
// them. Until a domain is verified, their shared onboarding sender only
// delivers to the email the Resend account itself was created with — which
// is fine here since that's the same john@mchsproperties.com address.
const ALERT_FROM = "McCallum Handyman Services <onboarding@resend.dev>";

exports.emailNewLead = onDocumentCreated(
  { document: "leads/{leadId}", secrets: [RESEND_API_KEY] },
  async (event) => {
    const lead = event.data?.data();
    if (!lead) return;

    const lines = [
      `Name: ${lead.name || "(not provided)"}`,
      `Phone: ${lead.phone || "(not provided)"}`,
      `Email: ${lead.email || "(not provided)"}`,
      "",
      "Message:",
      lead.message || "(none)",
      "",
      `Submitted: ${new Date().toISOString()}`,
      `Page: ${lead.page || "(unknown)"}`,
    ];

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: ALERT_FROM,
          to: [ALERT_TO],
          subject: `New quote request from ${lead.name || "a website visitor"}`,
          text: lines.join("\n"),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend API responded ${res.status}: ${body}`);
      }

      logger.info("Lead alert email sent", { leadId: event.params.leadId });
    } catch (err) {
      // Don't throw: the lead is already safely saved in Firestore even if
      // the email fails, so this just logs for follow-up rather than
      // retrying forever.
      logger.error("Failed to send lead alert email", {
        leadId: event.params.leadId,
        error: err.message,
      });
    }
  }
);
