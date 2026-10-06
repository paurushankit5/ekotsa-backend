import { loadEnv } from "../../config/env.js";
import { ContactLead } from "../../db/models/index.js";
import { sendEmail } from "../../services/mailer.js";

export const ContactService = {
  async createContact(input: {
    name: string;
    organization: string;
    email: string;
    countryCode: string;
    phone: string;
    whatsapp: string;
    requirement?: string | null;
  }): Promise<{ leadId: string; emailSent: boolean }> {
    const lead = await ContactLead.create({
      name: input.name.trim(),
      organization: input.organization.trim(),
      email: input.email.trim().toLowerCase(),
      countryCode: input.countryCode.trim(),
      phone: input.phone.trim(),
      whatsapp: input.whatsapp.trim(),
      requirement: input.requirement?.trim() || null,
      source: "contact_form",
      status: "NEW",
    });

    let emailSent = false;
    const env = loadEnv();
    const to = env.SMTP_TO;
    if (to && env.SMTP_USER) {
      try {
        const result = await sendEmail({
          to,
          subject: `Contact enquiry from ${lead.name} (${lead.organization})`,
          text: [
            `Name: ${lead.name}`,
            `Organization: ${lead.organization}`,
            `Email: ${lead.email}`,
            `Phone: ${lead.countryCode} ${lead.phone}`,
            `WhatsApp: ${lead.whatsapp}`,
            `Requirement: ${lead.requirement ?? "-"}`,
          ].join("\n"),
          html: `<p><b>Name:</b> ${lead.name}</p>
<p><b>Organization:</b> ${lead.organization}</p>
<p><b>Email:</b> ${lead.email}</p>
<p><b>Phone:</b> ${lead.countryCode} ${lead.phone}</p>
<p><b>WhatsApp:</b> ${lead.whatsapp}</p>
<p><b>Requirement:</b> ${lead.requirement ?? "-"}</p>`,
        });
        emailSent = result.delivered;
      } catch {
        emailSent = false;
      }
    }

    return { leadId: lead.id, emailSent };
  },

  async createBusinessAssessment(input: {
    name: string;
    organization: string;
    email: string;
    phone: string;
    industry?: string | null;
    requirement: string;
  }): Promise<{ leadId: string }> {
    const phone = input.phone.trim();
    const ccMatch = phone.match(/^(\+\d{1,4})\s*/);
    const countryCode = ccMatch?.[1] ?? "+1";
    const localPhone = ccMatch ? phone.slice(ccMatch[0].length).trim() || phone : phone;
    const requirement = input.industry
      ? `[Industry: ${input.industry.trim()}]\n${input.requirement.trim()}`
      : input.requirement.trim();

    const lead = await ContactLead.create({
      name: input.name.trim(),
      organization: input.organization.trim(),
      email: input.email.trim().toLowerCase(),
      countryCode,
      phone: localPhone,
      whatsapp: phone,
      requirement,
      source: "business_assessment",
      status: "NEW",
    });

    return { leadId: lead.id };
  },
};
