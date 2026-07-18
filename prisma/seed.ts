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
    { slug: "marketing", name: "Marketing", isDeepTier: true, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "design-creative", name: "Design & Creative", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "healthcare-allied", name: "Healthcare — Allied Health", isDeepTier: true, cardLayout: CardLayout.STRUCTURED_HOURLY },
    { slug: "trucking-logistics", name: "Trucking & Logistics", isDeepTier: true, cardLayout: CardLayout.STRUCTURED_HOURLY },
    // Breadth tier — aggregator-only, no custom ingestion (§4.1)
    { slug: "sales", name: "Sales", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "finance-accounting", name: "Finance & Accounting", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "customer-support", name: "Customer Support", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    { slug: "retail-hospitality", name: "Retail & Hospitality", isDeepTier: false, cardLayout: CardLayout.STRUCTURED_HOURLY },
    { slug: "operations-hr", name: "Operations & People", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
    // Neutral fallback bucket for jobs that can't be confidently classified.
    // NOT a real category — exclude it from SEO page generation (§7) and treat
    // it as a review queue. Better here than silently polluting a live vertical.
    { slug: "unsorted", name: "Unsorted", isDeepTier: false, cardLayout: CardLayout.KNOWLEDGE_WORK },
  ];

  // Batched inserts (createMany + skipDuplicates) instead of per-row upserts:
  // the DB can be far-region / high-latency, and hundreds of sequential
  // round-trips make the seed time out. skipDuplicates keeps it idempotent.
  await prisma.vertical.createMany({ data: verticals, skipDuplicates: true });
  const verticalRows = await prisma.vertical.findMany({ select: { id: true, slug: true } });
  const verticalRecords: Record<string, string> = Object.fromEntries(
    verticalRows.map((v) => [v.slug, v.id])
  );

  // ── Roles — seo_slug drives /jobs/{role-slug} (§7) ────
  const roles: { slug: string; name: string; vertical: string; aliases: string[] }[] = [
    // Tech
    { slug: "backend-engineer", name: "Backend Engineer", vertical: "tech-software", aliases: ["Backend Developer", "Server-side Engineer", "API Engineer"] },
    { slug: "frontend-engineer", name: "Frontend Engineer", vertical: "tech-software", aliases: ["Frontend Developer", "React Developer", "UI Developer"] },
    { slug: "fullstack-engineer", name: "Full-Stack Engineer", vertical: "tech-software", aliases: ["Full Stack Developer", "Fullstack Developer"] },
    { slug: "devops-engineer", name: "DevOps Engineer", vertical: "tech-software", aliases: ["Site Reliability Engineer", "Platform Engineer", "SRE"] },
    { slug: "data-engineer", name: "Data Engineer", vertical: "tech-software", aliases: ["Data Pipeline Engineer", "Analytics Engineer"] },
    // Creative / marketing
    { slug: "graphic-designer", name: "Graphic Designer", vertical: "design-creative", aliases: ["Visual Designer", "Brand Designer"] },
    { slug: "video-editor", name: "Video Editor", vertical: "design-creative", aliases: ["Videographer", "Video Producer"] },
    { slug: "content-marketer", name: "Content Marketer", vertical: "marketing", aliases: ["Content Strategist", "Copywriter"] },
    { slug: "social-media-manager", name: "Social Media Manager", vertical: "marketing", aliases: ["Social Media Coordinator", "Community Manager"] },
    // Healthcare — allied
    { slug: "physical-therapist", name: "Physical Therapist", vertical: "healthcare-allied", aliases: ["PT", "Physiotherapist"] },
    { slug: "radiologic-technologist", name: "Radiologic Technologist", vertical: "healthcare-allied", aliases: ["Rad Tech", "Imaging Tech", "X-Ray Tech"] },
    { slug: "respiratory-therapist", name: "Respiratory Therapist", vertical: "healthcare-allied", aliases: ["RT", "RRT"] },
    { slug: "occupational-therapist", name: "Occupational Therapist", vertical: "healthcare-allied", aliases: ["OT"] },
    { slug: "lab-technician", name: "Lab Technician", vertical: "healthcare-allied", aliases: ["Medical Lab Tech", "MLT"] },
    // Tech — additions
    { slug: "software-engineer", name: "Software Engineer", vertical: "tech-software", aliases: ["Software Developer", "SWE", "Software Development Engineer"] },
    { slug: "mobile-engineer", name: "Mobile Engineer", vertical: "tech-software", aliases: ["iOS Engineer", "Android Engineer", "iOS Developer", "Android Developer"] },
    { slug: "machine-learning-engineer", name: "Machine Learning Engineer", vertical: "tech-software", aliases: ["ML Engineer", "AI Engineer", "Applied Scientist"] },
    { slug: "data-scientist", name: "Data Scientist", vertical: "tech-software", aliases: ["Applied Data Scientist"] },
    { slug: "data-analyst", name: "Data Analyst", vertical: "tech-software", aliases: ["Business Intelligence Analyst", "BI Analyst"] },
    { slug: "qa-engineer", name: "QA Engineer", vertical: "tech-software", aliases: ["Test Engineer", "SDET", "QA Automation Engineer"] },
    { slug: "security-engineer", name: "Security Engineer", vertical: "tech-software", aliases: ["Application Security Engineer", "AppSec Engineer", "InfoSec Engineer"] },
    { slug: "product-manager", name: "Product Manager", vertical: "tech-software", aliases: ["PM", "Technical Product Manager", "Group Product Manager"] },
    { slug: "engineering-manager", name: "Engineering Manager", vertical: "tech-software", aliases: ["EM", "Software Engineering Manager", "Director of Engineering"] },
    // Marketing / creative — additions
    { slug: "product-designer", name: "Product Designer", vertical: "design-creative", aliases: ["UX Designer", "UI Designer", "UI/UX Designer", "Senior Product Designer"] },
    { slug: "marketing-manager", name: "Marketing Manager", vertical: "marketing", aliases: ["Growth Marketer", "Demand Generation Manager", "Growth Marketing Manager"] },
    { slug: "seo-specialist", name: "SEO Specialist", vertical: "marketing", aliases: ["SEO Manager", "Search Marketing Manager"] },
    { slug: "product-marketing-manager", name: "Product Marketing Manager", vertical: "marketing", aliases: ["PMM"] },
    // Sales
    { slug: "account-executive", name: "Account Executive", vertical: "sales", aliases: ["AE", "Enterprise Account Executive", "Sales Executive", "Technical Account Executive", "Enterprise AE", "Commercial Account Executive"] },
    { slug: "account-manager", name: "Account Manager", vertical: "sales", aliases: ["Client Manager", "Strategic Account Manager", "Key Account Manager"] },
    { slug: "sales-development-rep", name: "Sales Development Representative", vertical: "sales", aliases: ["SDR", "BDR", "Business Development Representative", "Sales Development Rep"] },
    { slug: "sales-manager", name: "Sales Manager", vertical: "sales", aliases: ["Head of Sales", "Sales Director", "Director of Sales", "VP Sales", "Account Director"] },
    { slug: "solutions-engineer", name: "Solutions Engineer", vertical: "sales", aliases: ["Sales Engineer", "Pre-Sales Engineer", "Solutions Consultant"] },
    // Finance & accounting
    { slug: "accountant", name: "Accountant", vertical: "finance-accounting", aliases: ["Staff Accountant", "Senior Accountant", "Accounting Manager"] },
    { slug: "financial-analyst", name: "Financial Analyst", vertical: "finance-accounting", aliases: ["FP&A Analyst", "Finance Analyst", "Financial Planning Analyst"] },
    { slug: "bookkeeper", name: "Bookkeeper", vertical: "finance-accounting", aliases: ["Accounts Payable Specialist", "Accounts Receivable Specialist"] },
    { slug: "controller", name: "Controller", vertical: "finance-accounting", aliases: ["Financial Controller", "Assistant Controller"] },
    // Customer support / success
    { slug: "customer-support-rep", name: "Customer Support Representative", vertical: "customer-support", aliases: ["Support Specialist", "Customer Support Agent", "Technical Support Engineer", "Support Engineer"] },
    { slug: "customer-success-manager", name: "Customer Success Manager", vertical: "customer-support", aliases: ["CSM", "Customer Success Specialist", "Technical Customer Success Manager"] },
    // Operations & people
    { slug: "recruiter", name: "Recruiter", vertical: "operations-hr", aliases: ["Technical Recruiter", "Talent Acquisition Specialist", "Talent Partner", "Sourcer"] },
    { slug: "people-operations", name: "People Operations", vertical: "operations-hr", aliases: ["HR Manager", "People Partner", "HR Business Partner", "HRBP"] },
    { slug: "operations-manager", name: "Operations Manager", vertical: "operations-hr", aliases: ["Business Operations Manager", "BizOps", "Program Manager", "Chief of Staff"] },
    // Healthcare — allied additions
    { slug: "medical-assistant", name: "Medical Assistant", vertical: "healthcare-allied", aliases: ["MA", "Certified Medical Assistant", "CMA"] },
    { slug: "pharmacy-technician", name: "Pharmacy Technician", vertical: "healthcare-allied", aliases: ["Pharm Tech"] },
    { slug: "phlebotomist", name: "Phlebotomist", vertical: "healthcare-allied", aliases: ["Phlebotomy Technician"] },
    { slug: "surgical-technologist", name: "Surgical Technologist", vertical: "healthcare-allied", aliases: ["Surgical Tech", "Scrub Tech"] },
    // Trucking
    { slug: "otr-driver", name: "OTR Truck Driver", vertical: "trucking-logistics", aliases: ["Over the Road Driver", "Long Haul Driver"] },
    { slug: "local-cdl-driver", name: "Local CDL Driver", vertical: "trucking-logistics", aliases: ["Local Delivery Driver", "CDL-A Local"] },
    { slug: "regional-cdl-driver", name: "Regional CDL Driver", vertical: "trucking-logistics", aliases: ["Regional Driver", "CDL-A Regional"] },
    { slug: "dispatcher", name: "Dispatcher", vertical: "trucking-logistics", aliases: ["Fleet Dispatcher", "Logistics Coordinator"] },
  ];

  await prisma.role.createMany({
    data: roles.map((r) => ({ slug: r.slug, name: r.name, verticalId: verticalRecords[r.vertical] })),
    skipDuplicates: true,
  });
  const roleRows = await prisma.role.findMany({ select: { id: true, slug: true } });
  const roleRecords: Record<string, string> = Object.fromEntries(roleRows.map((r) => [r.slug, r.id]));

  // rawText is globally unique, so a given alias can only point at one role —
  // de-dupe across roles (first wins) before the batch insert.
  const aliasByRawText = new Map<string, { rawText: string; roleId: string; resolvedBy: "MANUAL" }>();
  for (const r of roles) {
    for (const alias of r.aliases) {
      if (!aliasByRawText.has(alias)) {
        aliasByRawText.set(alias, { rawText: alias, roleId: roleRecords[r.slug], resolvedBy: "MANUAL" });
      }
    }
  }
  await prisma.roleAlias.createMany({ data: [...aliasByRawText.values()], skipDuplicates: true });

  // ── Skills — starter set. Expand from O*NET/ESCO before Slice 2. ─
  const skills = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "FastAPI",
    "AWS", "Docker", "Kubernetes", "PostgreSQL", "SQL", "System Design",
    "Adobe Photoshop", "Adobe Illustrator", "Figma", "Video Editing",
    "SEO", "Copywriting", "Social Media Strategy",
    "Patient Care", "EKG", "Ventilator Management", "Physical Assessment",
    "CDL Class A", "CDL Class B", "Hazmat Endorsement", "DOT Compliance",
  ];

  const skillSlugs = skills.map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  await prisma.skill.createMany({
    data: skills.map((s, i) => ({ slug: skillSlugs[i], name: s, reviewed: true })),
    skipDuplicates: true,
  });
  // createMany skips existing rows, so also force reviewed=true on canonical
  // skills that may already exist as unreviewed (e.g. created by ingestion
  // before being seeded). LLM-discovered skills stay reviewed=false.
  await prisma.skill.updateMany({ where: { slug: { in: skillSlugs } }, data: { reviewed: true } });

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
