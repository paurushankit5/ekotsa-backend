import type { NextFunction, Request, Response } from "express";
import {
  getReleaseManifestForPlatform,
  getReleaseManifests,
  toPublicReleaseManifest,
  type Platform,
} from "./releases.manifest.js";

export const ReleasesController = {
  async current(req: Request, res: Response, next: NextFunction) {
    try {
      const platform = String(req.query.platform || "");
      if (platform === "windows" || platform === "macos" || platform === "linux") {
        const release = getReleaseManifestForPlatform(platform as Platform);
        res.json({
          ok: true,
          release: release ? toPublicReleaseManifest(release) : null,
        });
        return;
      }
      res.json({
        ok: true,
        releases: getReleaseManifests().map(toPublicReleaseManifest),
      });
    } catch (error) {
      next(error);
    }
  },
};
