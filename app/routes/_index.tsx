import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // If there's a shop parameter, redirect to app with it
  if (url.searchParams.has("shop")) {
    return redirect(`/app${url.search}`);
  }
  
  // Otherwise redirect to auth login
  return redirect("/auth/login");
};