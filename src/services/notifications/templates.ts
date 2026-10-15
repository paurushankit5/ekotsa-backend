function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function renderEmail(template: string, payloadJson: string | null) {
  const payload = payloadJson ? (JSON.parse(payloadJson) as Record<string, unknown>) : {};

  switch (template) {
    case "device_reset_requested": {
      const userEmail = safeString(payload.userEmail);
      const requestId = safeString(payload.requestId);
      return {
        subject: `Device reset requested (${userEmail || "user"})`,
        text: `A device reset has been requested.\n\nUser: ${userEmail}\nRequest: ${requestId}\n\nReview in admin panel.`,
      };
    }
    case "device_reset_approved": {
      const requestId = safeString(payload.requestId);
      return {
        subject: "Device reset approved",
        text: `Your device reset request has been approved.\n\nRequest: ${requestId}\n\nYou can now activate on a new device.`,
      };
    }
    case "device_reset_rejected": {
      const requestId = safeString(payload.requestId);
      return {
        subject: "Device reset rejected",
        text: `Your device reset request was rejected.\n\nRequest: ${requestId}\n\nIf you need help, contact support.`,
      };
    }
    case "license_extended":
    case "payment_approved": {
      const plan = safeString(payload.plan) || "your plan";
      const expiresAt = safeString(payload.expiresAt);
      return {
        subject: `License extended (${plan})`,
        text: `Your license has been extended.\n\nPlan: ${plan}\nExpiry: ${expiresAt}\n\nIf you did not expect this change, please contact support.`,
      };
    }
    case "license_expiry_7d": {
      const plan = safeString(payload.plan) || "your plan";
      const expiresAt = safeString(payload.expiresAt);
      return {
        subject: `License expires soon (${plan})`,
        text: `Reminder: your license will expire soon.\n\nPlan: ${plan}\nExpiry: ${expiresAt}\n\nIf you've already renewed, you can refresh in the app.`,
      };
    }
    case "license_expiry_3d": {
      const plan = safeString(payload.plan) || "your plan";
      const expiresAt = safeString(payload.expiresAt);
      return {
        subject: `License expiring (${plan})`,
        text: `Reminder: your license is close to expiry.\n\nPlan: ${plan}\nExpiry: ${expiresAt}\n\nPlease renew to avoid entering grace/expired mode.`,
      };
    }
    default:
      return {
        subject: safeString(payload.subject) || "Notification",
        text: safeString(payload.text) || "Notification",
      };
  }
}
