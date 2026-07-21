// Scoped loading UI. See app/_components/RouteLoading.tsx for why this must
// never live at the app root: it would turn every notFound() into a soft 404.
export { default } from "@/app/_components/RouteLoading";
