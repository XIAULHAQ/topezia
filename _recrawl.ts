import { crawlSite } from "./lib/widget/crawl";
(async () => {
  const r = await crawlSite("6ba515a4-d93c-4632-b27b-95f80bc6c58e", "rodeo.graphics", 500);
  console.log(JSON.stringify(r));
})();
