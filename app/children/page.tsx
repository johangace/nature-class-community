import { publicMetadata } from "@/lib/seo";
import { requestLocaleChoice } from "@/lib/request-locale";
import { ChildrenPage } from "../audiences/ChildrenPage";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata(
  "/children",
  "What children learn outside | Nature Class",
  "Children plant, build, paint and look closely at the living things around them. See the activities and what teachers say about them."
);

export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const choice = await requestLocaleChoice((await searchParams).locale);
  return <ChildrenPage {...choice} />;
}
