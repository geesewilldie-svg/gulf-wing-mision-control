import EstimatePreview from "@/components/estimate-preview";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EstimatePreview id={id} />;
}
