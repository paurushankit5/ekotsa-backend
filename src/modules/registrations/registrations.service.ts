import {
  CustomerRegistration,
  Organization,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";

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
  status: string;
  linkedUserId: string | null;
  firstDownloadAt?: string | null;
  firstDeviceActivatedAt?: string | null;
  createdAt: string;
};

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
  async create(input: {
    fullName: string;
    organizationName: string;
    email: string;
    contactCountryCode?: string;
    contactNumber?: string;
    whatsappNumber?: string;
    linkedUserId?: string | null;
    source?: string;
  }): Promise<{ registration: RegistrationPublic }> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await CustomerRegistration.findOne({ where: { normalizedEmail } });
    if (existing) {
      throw new AppError(409, "Registration already exists for email", "REGISTRATION_EXISTS");
    }

    const org = await OrganizationsService.ensureForName({
      displayName: input.organizationName,
      createdByUserId: input.linkedUserId ?? null,
    });

    let linkedUserId = input.linkedUserId ?? null;
    if (!linkedUserId) {
      const user = await User.findOne({ where: { email: normalizedEmail } });
      linkedUserId = user?.id ?? null;
    }

    const registration = await CustomerRegistration.create({
      fullName: input.fullName.trim(),
      organizationName: input.organizationName.trim(),
      organizationId: org.id,
      normalizedEmail,
      contactCountryCode: input.contactCountryCode ?? null,
      contactNumber: input.contactNumber ?? null,
      whatsappNumber: input.whatsappNumber ?? null,
      status: linkedUserId ? "AUTHENTICATED" : "PENDING_AUTH",
      source: input.source ?? "public_download",
      linkedUserId,
    });

    return {
      registration: {
        id: registration.id,
        fullName: registration.fullName,
        organizationName: registration.organizationName,
        organizationId: registration.organizationId,
        email: registration.normalizedEmail,
        status: registration.status,
        linkedUserId: registration.linkedUserId,
        createdAt: registration.createdAt.toISOString(),
      },
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

    return {
      registration: {
        id: registration.id,
        fullName: registration.fullName,
        organizationName: registration.organizationName,
        organizationId: registration.organizationId,
        email: registration.normalizedEmail,
        status: registration.status,
        linkedUserId: registration.linkedUserId,
        firstDownloadAt: registration.firstDownloadAt?.toISOString() ?? null,
        firstDeviceActivatedAt: registration.firstDeviceActivatedAt?.toISOString() ?? null,
        createdAt: registration.createdAt.toISOString(),
      },
    };
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
