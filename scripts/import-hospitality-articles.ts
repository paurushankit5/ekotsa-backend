/**
 * Prepare or stage the six hospitality blog drafts supplied by Editorial.
 *
 * Dry run (default): npx tsx scripts/import-hospitality-articles.ts
 * Apply drafts:      npx tsx scripts/import-hospitality-articles.ts --apply
 * Publish:            npx tsx scripts/import-hospitality-articles.ts --apply --publish
 * Update matching:   ... --apply --update-existing
 *
 * The importer is intentionally conservative: an existing BLOG article with
 * the same slug is skipped unless --update-existing is supplied. It never
 * publishes an article.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CmsArticle, User, sequelize } from "../src/db/models/index.js";
import { CmsContentService, type UpsertArticleInput } from "../src/modules/cms/cms.content.service.js";

type ArticleDraft = UpsertArticleInput & { sourceLabel: string; materialEdits: string[] };

const sourcePath = path.join(process.cwd(), "docs/cms/hospitality-articles-source.md");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const updateExisting = args.has("--update-existing");
const publish = args.has("--publish");

if (publish && !apply) {
  throw new Error("--publish requires --apply");
}

const verifiedRoutes = {
  atithi: "/products/atithi",
  walkthrough: "/contact?enquiry=atithi-demo",
  calculator: "/savings-calculator",
};

const claimSafeCopy: Record<string, string> = {
  "restaurant-menu-engineering-food-cost-control":
    "Current Atithi evidence covers local inventory and recipe records, billing, table service and operational review. Automatic Stars/Plowhorses/Puzzles/Dogs classification, FIFO expiry alerts and digital shift-waste logging are not established as released customer features here; treat them as workflow ideas to validate during a walkthrough.",
  "restaurant-portion-control-inventory-variance":
    "Current Atithi evidence covers local inventory, recipe records, purchasing and billing workflows. A live theoretical-versus-actual variance report, vendor price variance alert and occupancy-linked prep forecast are not established as released integrations; confirm the available workflow and any pilot scope before making that claim.",
  "restaurant-kitchen-workflow-front-of-house-service":
    "Atithi’s current product material describes browser-based waiter ordering on a configured local network and restaurant KOT workflows. A customer-facing KDS, unified guest profiles, allergen prompts and pairing prompts are not established as released features in the current evidence; validate the exact workflow during a walkthrough.",
  "restaurant-prime-cost-control-table-turnover":
    "Current Atithi evidence covers billing and invoice review, restaurant KOT workflows, and room and stay records. Direct room-folio posting, live prime-cost dashboards and manager-PIN comp/void controls are not established as released features in the current evidence; confirm scope before promising them.",
  "restaurant-labor-scheduling-upselling-strategies":
    "Current Atithi evidence does not establish labour scheduling, automated upsell prompts, server scorecards or sales-to-labour forecasting as released product features. Keep these as operating practices and confirm any available pilot or integration separately.",
  "commission-free-restaurant-ordering-brand-growth":
    "Current evidence supports offline-first local operation and browser-based waiter ordering on a configured property network. Direct guest QR ordering, commission-free aggregator replacement, smart delivery throttling and customer-data ownership claims are not established as released Atithi features; confirm the current product scope before using them in a buying decision.",
};

const claimSafeDescriptions: Record<string, string> = {
  "restaurant-menu-engineering-food-cost-control": "Practical menu engineering, recipe costing, FIFO rotation and waste-tracking habits for restaurant and hotel F&B teams.",
  "restaurant-portion-control-inventory-variance": "Practical controls for portion consistency, supplier checks, prep planning and theoretical-versus-actual food-cost review.",
  "restaurant-kitchen-workflow-front-of-house-service": "Practical ways to reduce kitchen bottlenecks, maintain equipment and improve the first moments of a guest visit.",
  "restaurant-prime-cost-control-table-turnover": "Practical ways to review prime cost, table flow, guest recovery, comps, voids and hotel dining billing controls.",
  "restaurant-labor-scheduling-upselling-strategies": "Practical ideas for demand-aware staffing, hospitality-led recommendations, overhead review and a clearer restaurant identity.",
  "commission-free-restaurant-ordering-brand-growth": "Practical ways to protect off-premise margins, improve packaging, build local demand and assess direct ordering options.",
};

function metadata(text: string, label: string) {
  const match = text.match(new RegExp(`^\\* \\*\\*${label}:\\*\\* (.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function unquote(value: string) {
  return value.replace(/^`|`$/g, "").replace(/^\//, "").replace(/^blog\//, "");
}

function articleContent(slug: string, body: string, materialEdits: string[]) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("### Direct Answer Summary"));
  const content = lines
    .slice(start >= 0 ? start : 0)
    .map((line) => line.trim())
    .filter((line) => line && line !== "---")
    .filter((line) => !line.startsWith("* **URL Slug:"))
    .filter((line) => !line.startsWith("* **SEO Title:"))
    .filter((line) => !line.startsWith("* **Meta Description:"))
    .filter((line) => !line.startsWith("* **Primary & Semantic Keywords:"))
    .map((line) => line.startsWith("### ") ? `## ${line.slice(4)}` : line);

  const productIndex = content.findIndex((line) => line.startsWith("## How Ekotsa"));
  if (productIndex >= 0 && claimSafeCopy[slug]) {
    const nextCta = content.findIndex((line, index) => index > productIndex && line.startsWith("**"));
    const end = nextCta > productIndex ? nextCta : content.length;
    content.splice(productIndex, end - productIndex, claimSafeCopy[slug]);
    materialEdits.push("Replaced unsupported product-feature claims with a scoped Atithi evidence note; hospitality guidance was retained.");
  }

  const numericReplacements: Array<[string, string]> = [
    ["25% to 30% food cost", "25% to 30% food-cost planning range (a worked assumption, not a universal standard)"],
    ["25%–30% food cost", "25%–30% food-cost planning range (a worked assumption, not a universal standard)"],
    ["under 1% to 2%", "a small variance target agreed with the operator; the 1%–2% figure is a worked assumption, not a universal benchmark"],
    ["under 60%", "a prime-cost threshold agreed with the operator; the 60% figure is a worked assumption, not a universal benchmark"],
    ["25% to 30% of off-premise order value", "a variable share of off-premise order value; the 25%–30% figure is a worked assumption and actual fees vary by contract and market"],
    ["between 20% and 30%", "between 20% and 30% as a worked assumption; actual fees vary by contract and market"],
  ];
  const productClaimReplacements: Array<[string, string]> = [
    ["Modern POS systems like **Ekotsa** automate recipe-level stock deduction and menu profitability tracking in real time.", "A suitable POS can automate recipe-level stock deduction and menu profitability tracking; confirm the exact release scope before relying on it."],
    ["tracking **Theoretical vs. Actual variance** daily in **Ekotsa**.", "tracking theoretical-versus-actual variance daily in a suitable inventory/POS workflow."],
    ["through **Ekotsa**.", "through a suitable hospitality workflow."],
    ["in **Ekotsa Atithi** without front-desk delays.", "through a verified PMS/POS integration, if that workflow is available for the property."],
    ["using **Ekotsa** server scorecards and sales-to-labor analytics.", "using demand, service and sales reports that the operator has verified for the property."],
    ["converting repeat diners to commission-free direct ordering via **Ekotsa**", "converting repeat diners to a verified direct-ordering channel"],
  ];
  let productEdit = false;
  for (let index = 0; index < content.length; index += 1) {
    let next = content[index];
    for (const [from, to] of productClaimReplacements) {
      if (next.includes(from)) {
        next = next.replaceAll(from, to);
        productEdit = true;
      }
    }
    content[index] = next;
  }
  if (productEdit) materialEdits.push("Reworded unsupported product claims in summaries and advice so they describe verification or general practice rather than current availability.");

  let numericEdit = false;
  for (let index = 0; index < content.length; index += 1) {
    let next = content[index];
    for (const [from, to] of numericReplacements) {
      if (next.includes(from)) {
        next = next.replaceAll(from, to);
        numericEdit = true;
      }
    }
    content[index] = next;
  }
  if (slug === "commission-free-restaurant-ordering-brand-growth") {
    content.splice(
      ...(() => {
        const row = content.findIndex((line) => line.includes("0% aggregator commission"));
        return row >= 0 ? [row, 1, "| **Commission fee** | Not established in current Atithi evidence | Confirm current contracts and product scope |"] : [0, 0];
      })(),
    );
    numericEdit = true;
  }
  if (numericEdit) materialEdits.push("Reframed unsupported numerical benchmarks and fee claims as worked assumptions or variable figures; no universal guarantee is made.");

  return content;
}

function parseDrafts(source: string): ArticleDraft[] {
  return source
    .split(/^## (Blog Post \d+): /m)
    .reduce<ArticleDraft[]>((drafts, value, index, parts) => {
      if (index % 2 === 0 || !value.trim()) return drafts;
      const sourceLabel = value.trim();
      const body = parts[index + 1] ?? "";
      const title = body.split(/\r?\n/, 1)[0]?.trim() ?? sourceLabel;
      const slug = unquote(metadata(body, "URL Slug"));
      const seoTitle = unquote(metadata(body, "SEO Title"));
      const seoDescription = metadata(body, "Meta Description");
      const safeDescription = claimSafeDescriptions[slug] ?? seoDescription;
      const keywords = metadata(body, "Primary & Semantic Keywords")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const materialEdits: string[] = [];
      const content = articleContent(slug, body, materialEdits);
      const wordCount = content.join(" ").split(/\s+/).filter(Boolean).length;
      const relatedLinks = [
        { label: "Explore Ekotsa Atithi", href: verifiedRoutes.atithi },
        { label: "Book a walkthrough", href: verifiedRoutes.walkthrough },
      ];
      if (slug.includes("food-cost") || slug.includes("portion-control") || slug.includes("prime-cost")) {
        relatedLinks.push({ label: "Try the Savings Calculator", href: verifiedRoutes.calculator });
      }
      drafts.push({
        sourceLabel,
        kind: "BLOG",
        slug,
        title,
        excerpt: safeDescription,
        description: safeDescription,
        category: "Hospitality operations",
        status: publish ? "published" : "draft",
        readingTime: `${Math.max(5, Math.ceil(wordCount / 220))} min read`,
        coverLabel: "Hospitality operations",
        keywords,
        content,
        relatedLinks,
        seoTitle,
        seoDescription: safeDescription,
        sortOrder: drafts.length + 10,
        note: `Imported from ${sourceLabel}; ${publish ? "published by explicit operator request" : "staged as draft"}. ${materialEdits.join(" ")}`,
        materialEdits,
      });
      return drafts;
    }, []);
}

async function main() {
  const source = await readFile(sourcePath, "utf8");
  const drafts = parseDrafts(source);
  if (drafts.length !== 6) throw new Error(`Expected six drafts, parsed ${drafts.length}`);

  console.log(`[hospitality-import] ${apply ? "apply" : "dry-run"}: ${drafts.length} drafts`);
  if (!apply) {
    for (const draft of drafts) console.log(`READY ${draft.slug} — ${draft.title}`);
    return;
  }

  const actor = await User.findOne({ where: { role: "ADMIN" }, order: [["createdAt", "ASC"]] });
  if (!actor) throw new Error("No ADMIN actor found; pass an authenticated CMS session or create an admin before applying drafts.");

  for (const draft of drafts) {
    const existing = await CmsArticle.findOne({ where: { kind: "BLOG", slug: draft.slug } });
    if (existing && (!updateExisting || existing.title !== draft.title)) {
      console.log(`SKIP ${draft.slug} — existing CMS article preserved (id=${existing.id}, status=${existing.status})`);
      continue;
    }
    await CmsContentService.upsertArticle(draft, {
      userId: actor.id,
      email: actor.email,
      role: "ADMIN",
    });
    console.log(`${existing ? "UPDATED" : "CREATED"} ${draft.slug} — draft only`);
  }
}

main()
  .catch((error) => {
    console.error("[hospitality-import] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => undefined);
  });
