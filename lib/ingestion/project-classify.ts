/**
 * Which vertical a freelance project belongs to, decided by the project's OWN
 * skill labels rather than by the search query that found it.
 *
 * WHY THIS EXISTS
 *
 * run-project-ingestion.ts used to say "the query IS the classification: a
 * project found by 'logo design' is a design project". Measured against the
 * live API, that isn't true. Freelancer's `query` parameter is a loose recall
 * tool, not a filter:
 *
 *   - "ai video editing" returns 46 active projects, of which about 5 are
 *     actually video work. The rest include "BLITHCHRON Fest T-Shirt Design",
 *     "P2P Decentralised Messaging Platform Development" and "Literature
 *     Homework Assistance".
 *   - Eight different video queries returned 44 results each with an identical
 *     top hit — a P2P messaging platform.
 *   - "logo design" and "python developer" share 16% of their results.
 *
 * It does filter — a nonsense query returns 0, and "bookkeeping" vs "logo
 * design" overlap 0% — so the queries are still worth having for recall. They
 * just can't be trusted to say what a project IS.
 *
 * The skill labels can. They come from Freelancer's own taxonomy, are attached
 * per project, and are specific: "Video Editing", "Adobe Premiere Pro",
 * "Intuit QuickBooks". So every project votes with its labels and the majority
 * vertical wins.
 *
 * The map below was built from the labels actually observed across 853 project
 * rows spanning every ingestion query, not from guesswork — which is why it
 * contains "Intuit QuickBooks" and "User Interface / IA" rather than tidy
 * invented names.
 */

/** Lowercased Freelancer skill label -> our vertical slug. */
const SKILL_VERTICAL: Record<string, string> = {};

const assign = (vertical: string, labels: string[]) => {
  for (const l of labels) SKILL_VERTICAL[l.toLowerCase()] = vertical;
};

assign("design-creative", [
  "Graphic Design", "Logo Design", "Photoshop", "Adobe Photoshop", "Adobe Illustrator",
  "Illustrator", "Illustration", "Branding", "Corporate Identity", "Typography",
  "Print Design", "Adobe InDesign", "Visual Design", "Creative Design", "Canva",
  // Video and motion — the reason the video queries were widened at all.
  "Video Editing", "Video Production", "Video Services", "Video Post-editing",
  "After Effects", "Adobe Premiere Pro", "Motion Graphics", "Animation",
  "2D Animation", "3D Animation", "Character Animation", "Videography",
  "Video Broadcasting", "Final Cut Pro", "Adobe After Effects", "YouTube Video Editing",
  "Editing", "Video Streaming",
  // 3D and product design
  "3D Modelling", "3D Rendering", "3D Design", "AutoCAD",
  // Product/UI design
  "User Interface / IA", "UI / User Interface", "User Experience Research",
  "UX / User Experience", "Figma",
]);

assign("tech-software", [
  "PHP", "HTML", "HTML5", "CSS", "JavaScript", "TypeScript", "Web Development",
  "Website Development", "Frontend Development", "Full Stack Development",
  "Backend Development", "WordPress", "Shopify", "Software Architecture",
  "Software Development", "Mobile App Development", "Android", "Android App Development",
  "iPhone", "iOS Development", "Flutter", "Dart", "React", "React.js", "Node.js",
  "AngularJS", "Vue.js", "Python", "Java", "C# Programming", "C++ Programming",
  "Golang", "Ruby on Rails", "Laravel", "Django", "MySQL", "PostgreSQL", "MongoDB",
  "Database Design", "Database Management", "Database Development", "API Development",
  "API Integration", "Cloud Computing", "AWS", "DevOps", "Linux", "Docker",
  "Machine Learning (ML)", "Artificial Intelligence", "AI Development", "Data Science",
  "Data Analysis", "Data Management", "Blockchain", "Cybersecurity", "Web Scraping",
  "Game Development", "Unity 3D",
]);

assign("marketing", [
  "SEO", "Internet Marketing", "Digital Marketing", "Marketing", "Social Media Marketing",
  "Social Media Management", "Content Creation", "Content Writing", "Copywriting",
  "Email Marketing", "Lead Generation", "Keyword Research", "Website Optimization",
  "Link Building", "Google Adwords", "Google Analytics", "Facebook Marketing",
  "Instagram Marketing", "Advertising", "Public Relations", "Brand Marketing",
  "Article Writing", "Blog Writing", "Ghostwriting", "Technical Writing",
  "Proofreading", "Research Writing", "Creative Writing",
]);

assign("finance-accounting", [
  "Accounting", "Bookkeeping", "Finance", "Financial Analysis", "Financial Consulting",
  "Financial Research", "Financial Modeling", "Tax Compliance", "Tax Law", "Payroll",
  "Intuit QuickBooks", "Xero", "Audit", "Business Analysis",
]);

assign("operations-hr", [
  "Data Entry", "Virtual Assistant", "Project Management", "Excel", "Microsoft Excel",
  "Administrative Support", "Human Resources", "Recruitment", "Operations Research",
  "Logistics & Shipping", "Supply Chain", "Google Sheets", "Microsoft Office",
]);

assign("customer-support", [
  "Customer Service", "Customer Support", "Customer Experience", "Technical Support",
  "Helpdesk", "Phone Support", "Email Handling", "Live Chat Support",
]);

assign("sales", [
  "Sales", "Business Development", "CRM", "Telemarketing", "Salesforce.com",
  "Sales Promotion", "Account Management",
]);

export type Classification = {
  vertical: string;
  /** How the vertical was chosen — logged so a bad map is visible in a run. */
  basis: "skills" | "query-fallback";
  /** Winning label count, for the tie/confidence note in the log. */
  votes: number;
};

/**
 * Majority vote across a project's skill labels.
 *
 * Majority rather than first-match matters: a project labelled
 * "Website Design, PHP, HTML, Web Development" is web development even though
 * "Website Design" is a design label, and the three tech labels outvote it.
 *
 * Unmapped labels are ignored rather than treated as evidence, and a project
 * with no mapped labels at all falls back to the query's vertical — the old
 * behaviour — so this can only improve classification, never lose a project.
 */
export function classifyProjectVertical(skills: string[], queryVertical: string): Classification {
  const votes = new Map<string, number>();
  for (const s of skills) {
    const v = SKILL_VERTICAL[s.trim().toLowerCase()];
    if (v) votes.set(v, (votes.get(v) ?? 0) + 1);
  }
  if (votes.size === 0) return { vertical: queryVertical, basis: "query-fallback", votes: 0 };

  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  // A genuine tie is resolved toward the query, which at least reflects intent.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    const tied = ranked.filter((r) => r[1] === ranked[0][1]).map((r) => r[0]);
    if (tied.includes(queryVertical)) return { vertical: queryVertical, basis: "skills", votes: ranked[0][1] };
  }
  return { vertical: ranked[0][0], basis: "skills", votes: ranked[0][1] };
}
