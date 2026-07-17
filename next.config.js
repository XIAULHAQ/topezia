/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * Keep the PDF stack out of the webpack bundle.
     *
     * pdf-parse pulls in pdfjs-dist, whose ESM build doesn't survive webpack's
     * server bundling — it throws "Object.defineProperty called on non-object"
     * the moment the résumé-upload route imports it. Marking these external
     * makes Node require() them from node_modules at runtime, which is how
     * pdfjs expects to be loaded.
     *
     * (Next 15 renames this to `serverExternalPackages`.)
     */
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
};

module.exports = nextConfig;
