import { Op } from "sequelize";
import { User } from "../../db/models/index.js";

const THROTTLE_MS = 60 * 60 * 1000;

/**
 * Record that a user was active (sign-in, account use). Used for the inactive-account erasure
 * promised in the Privacy Policy; any activity also cancels a pending inactivity notice.
 * At most one write per user per hour; never throws.
 */
export async function touchUserActivity(userId: string): Promise<void> {
  try {
    const now = new Date();
    await User.update(
      { lastActiveAt: now, inactivityNoticeSentAt: null },
      {
        where: {
          id: userId,
          [Op.or]: [{ lastActiveAt: null }, { lastActiveAt: { [Op.lt]: new Date(now.getTime() - THROTTLE_MS) } }],
        },
      },
    );
  } catch (error) {
    console.error("[privacy] could not record user activity", error);
  }
}
