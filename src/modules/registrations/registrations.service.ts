import {
  CustomerRegistration,
  Organization,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DownloadsService } from "../downloads/downloads.service.js";

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type OrgPublic = {
  id: string;
  displayName: string;
  status: string;
  createdAt: string;
};

type RegistrationPublic = {
  id: string;
  fullName: string;
  organizationName: string;
  organizationId: string | null;
  email: string;
  contactCountryCode: string | null;
  contactNumber: string | null;
  industry: string | null;
  businessAddress: string | null;
  status: string;
  linkedUserId: string | null;
  firstDownloadAt?: string | null;
  firstDeviceActivatedAt?: string | null;
  createdAt: string;
};

type DownloadAuthPublic = {
  token: string;
  expiresAt: string;
  remainingUses: number;
};

function toPublic(registration: CustomerRegistration): RegistrationPublic {
  return {
    id: registration.id,
    fullName: registration.fullName,
    organizationName: registration.organizationName,
    organizationId: registration.organizationId,
    email: registration.normalizedEmail,
    contactCountryCode: registration.contactCountryCode,
    contactNumber: registration.contactNumber,
    industry: registration.industry,
    businessAddress: registration.businessAddress,
    status: registration.status,
    linkedUserId: registration.linkedUserId,
    firstDownloadAt: registration.firstDownloadAt?.toISOString() ?? null,
    firstDeviceActivatedAt: registration.firstDeviceActivatedAt?.toISOString() ?? null,
    createdAt: registration.createdAt.toISOString(),
  };
}

export const OrganizationsService = {
  async ensureForName(input: {
    displayName: string;
    createdByUserId?: string | null;
  }): Promise<{ id: string; displayName: string; status: string }> {
    const normalizedName = normalizeName(input.displayName);
    let org = await Organization.findOne({ where: { normalizedName } });
    if (!org) {
      org = await Organization.create({
        displayName: input.displayName.trim(),
        normalizedName,
        createdByUserId: input.createdByUserId ?? null,
        status: "ACTIVE",
      });
    }
    return {
      id: org.id,
      displayName: org.displayName,
      status: org.status,
    };
  },

  async getById(id: string): Promise<OrgPublic> {
    const org = await Organization.findByPk(id);
    if (!org) throw new AppError(404, "Organization not found", "ORG_NOT_FOUND");
    return {
      id: org.id,
      displayName: org.displayName,
      status: org.status,
      createdAt: org.createdAt.toISOString(),
    };
  },
};

export const RegistrationsService = {
  /**
   * Lead capture before installer download.
   * Re-submitting the same email updates contact details and issues a fresh download token
   * (no login required).
   */
  async create(input: {
    fullName: string;
    organizationName: string;
    email: string;
    contactCountryCode: string;
    contactNumber: string;
    industry: string;
    businessAddress: string;
    whatsappNumber?: string;
    linkedUserId?: string | null;
    source?: string;
  }): Promise<{
    registration: RegistrationPublic;
    downloadAuth: DownloadAuthPublic;
    created: boolean;
  }> {
    const normalizedEmail = normalizeEmail(input.email);
    const org = await OrganizationsService.ensureForName({
      displayName: input.organizationName,
      createdByUserId: input.linkedUserId ?? null,
    });

    let linkedUserId = input.linkedUserId ?? null;
    if (!linkedUserId) {
      const user = await User.findOne({ where: { email: normalizedEmail } });
      linkedUserId = user?.id ?? null;
    }

    const mobile = input.contactNumber.trim();
    const whatsapp = (input.whatsappNumber ?? mobile).trim();
    const leadFields = {
      fullName: input.fullName.trim(),
      organizationName: input.organizationName.trim(),
      organizationId: org.id,
      contactCountryCode: input.contactCountryCode.trim(),
      contactNumber: mobile,
      whatsappNumber: whatsapp,
      industry: input.industry.trim(),
      businessAddress: input.businessAddress.trim(),
      source: input.source ?? "public_download",
    };

    let registration = await CustomerRegistration.findOne({ where: { normalizedEmail } });
    let created = false;

    if (registration) {
      const nextStatus =
        (registration.linkedUserId ?? linkedUserId) && registration.status === "PENDING_AUTH"
          ? "AUTHENTICATED"
          : registration.status;
      await registration.update({
        ...leadFields,
        linkedUserId: registration.linkedUserId ?? linkedUserId,
        status: nextStatus,
      });
      await registration.reload();
    } else {
      registration = await CustomerRegistration.create({
        ...leadFields,
        normalizedEmail,
        status: linkedUserId ? "AUTHENTICATED" : "PENDING_AUTH",
        linkedUserId,
      });
      created = true;
    }

    const downloadAuth = await DownloadsService.createSessionForRegistration(registration.id);

    return {
      registration: toPublic(registration),
      downloadAuth,
      created,
    };
  },

  async status(input: {
    email?: string;
    userId?: string;
    registrationId?: string;
  }): Promise<{ registration: RegistrationPublic }> {
    let registration: CustomerRegistration | null = null;
    if (input.registrationId) {
      registration = await CustomerRegistration.findByPk(input.registrationId);
    } else if (input.userId) {
      registration = await CustomerRegistration.findOne({
        where: { linkedUserId: input.userId },
      });
    } else if (input.email) {
      registration = await CustomerRegistration.findOne({
        where: { normalizedEmail: normalizeEmail(input.email) },
      });
    }

    if (!registration) {
      throw new AppError(404, "Registration not found", "REGISTRATION_NOT_FOUND");
    }

    return { registration: toPublic(registration) };
  },

  async linkUser(
    userId: string,
    email: string,
  ): Promise<{ id: string; linkedUserId: string | null; status: string } | null> {
    const registration = await CustomerRegistration.findOne({
      where: { normalizedEmail: normalizeEmail(email) },
    });
    if (!registration) return null;
    if (registration.linkedUserId && registration.linkedUserId !== userId) {
      return {
        id: registration.id,
        linkedUserId: registration.linkedUserId,
        status: registration.status,
      };
    }
    await registration.update({
      linkedUserId: userId,
      status:
        registration.status === "PENDING_AUTH" ? "AUTHENTICATED" : registration.status,
    });
    return {
      id: registration.id,
      linkedUserId: registration.linkedUserId,
      status: registration.status,
    };
  },
};
