/**
 * Topezia taxonomy seed — spec §3.3, §2
 *
 * This is a STARTER seed, not the full taxonomy. It gets you enough rows to
 * build and test the pipeline end-to-end. Before Slice 2 ingestion at real
 * volume, expand roles/skills from O*NET or ESCO exports rather than typing
 * them by hand — this file shows the shape, not the final size.
 *
 * Run: npm run db:seed
 */
import { PrismaClient, CardLayout } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Verticals (spec §2) ───────────────────────────────
  const verticals = [
    { slug: "tech-software", name: "Tech & Software", isDeepTier: true, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "marketing-creative", name: "Marketing & Creative", isDeepTier: true, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "healthcare-allied", name: "Healthcare — Allied Health", isDeepTier: true, cardLayout: CardLayout.STRUCTURED_HOURLY },
    { slug: "trucking-logistics", name: "Trucking & Logistics", isDeepTier: true, cardLayout: CardLayout.STRUCTURED_HOURLY },
    // Breadth tier — aggregator-only, no custom ingestion (§4.1)
    { slug: "sales", name: "Sales", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "finance-accounting", name: "Finance & Accounting", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "customer-support", name: "Customer Support", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "retail-hospitality", name: "Retail & Hospitality", isDeepTier: false, cardLayout: CardLayout.STRUCTURED_HOURLY },
  ];

  const verticalRecords: Record<string, string> = {};
  for (const v of verticals) {
    const rec = await prisma.vertical.upsert({
      where: { slug: v.slug },
      update: {},
      create: v,
    });
    verticalRecords[v.slug] = rec.id;
  }

  // ── Roles — seo_slug drives /jobs/{role-slug} (§7) ────
  const roles: { slug: string; name: string; vertical: string; aliases: string[] }[] = [
    // Tech
    { slug: "backend-engineer", name: "Backend Engineer", vertical: "tech-software", aliases: ["Backend Developer", "Server-side Engineer", "API Engineer"] },
    { slug: "frontend-engineer", name: "Frontend Engineer", vertical: "tech-software", aliases: ["Frontend Developer", "React Developer", "UI Developer"] },
    { slug: "fullstack-engineer", name: "Full-Stack Engineer", vertical: "tech-software", aliases: ["Full Stack Developer", "Fullstack Developer"] },
    { slug: "devops-engineer", name: "DevOps Engineer", vertical: "tech-software", aliases: ["Site Reliability Engineer", "Platform Engineer", "SRE"] },
    { slug: "data-engineer", name: "Data Engineer", vertical: "tech-software", aliases: ["Data Pipeline Engineer", "Analytics Engineer"] },
    // Creative / marketing
    { slug: "graphic-designer", name: "Graphic Designer", vertical: "marketing-creative", aliases: ["Visual Designer", "Brand Designer"] },
    { slug: "video-editor", name: "Video Editor", vertical: "marketing-creative", aliases: ["Videographer", "Video Producer"] },
    { slug: "content-marketer", name: "Content Marketer", vertical: "marketing-creative", aliases: ["Content Strategist", "Copywriter"] },
    { slug: "social-media-manager", name: "Social Media Manager", vertical: "marketing-creative", aliases: ["Social Media Coordinator", "Community Manager"] },
    // Healthcare — allied
    { slug: "physical-therapist", name: "Physical Therapist", vertical: "healthcare-allied", aliases: ["PT", "Physiotherapist"] },
    { slug: "radiologic-technologist", name: "Radiologic Technologist", vertical: "healthcare-allied", aliases: ["Rad Tech", "Imaging Tech", "X-Ray Tech"] },
    { slug: "respiratory-therapist", name: "Respiratory Therapist", vertical: "healthcare-allied", aliases: ["RT", "RRT"] },
    { slug: "occupational-therapist", name: "Occupational Therapist", vertical: "healthcare-allied", aliases: ["OT"] },
    { slug: "lab-technician", name: "Lab Technician", vertical: "healthcare-allied", aliases: ["Medical Lab Tech", "MLT"] },
    // Trucking
    { slug: "otr-driver", name: "OTR Truck Driver", vertical: "trucking-logistics", aliases: ["Over the Road Driver", "Long Haul Driver"] },
    { slug: "local-cdl-driver", name: "Local CDL Driver", vertical: "trucking-logistics", aliases: ["Local Delivery Driver", "CDL-A Local"] },
    { slug: "dispatcher", name: "Dispatcher", vertical: "trucking-logistics", aliases: ["Fleet Dispatcher", "Logistics Coordinator"] },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        slug: r.slug,
        name: r.name,
        verticalId: verticalRecords[r.vertical],
      },
    });
    for (const alias of r.aliases) {
      await prisma.roleAlias.upsert({
        where: { rawText: alias },
        update: {},
        create: { rawText: alias, roleId: role.id, resolvedBy: "MANUAL" },
      });
    }
  }

  // ── Skills — starter set. Expand from O*NET/ESCO before Slice 2. ─
  const skills = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "FastAPI",
    "AWS", "Docker", "Kubernetes", "PostgreSQL", "SQL", "System Design",
    "Adobe Photoshop", "Adobe Illustrator", "Figma", "Video Editing",
    "SEO", "Copywriting", "Social Media Strategy",
    "Patient Care", "EKG", "Ventilator Management", "Physical Assessment",
    "CDL Class A", "CDL Class B", "Hazmat Endorsement", "DOT Compliance",
  ];

  for (const s of skills) {
    const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await prisma.skill.upsert({
      where: { slug },
      update: {},
      create: { slug, name: s },
    });
  }

  console.log(`Seeded ${verticals.length} verticals, ${roles.length} roles, ${skills.length} skills.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
