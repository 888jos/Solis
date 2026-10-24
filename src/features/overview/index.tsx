import { EmptyState, PageHeader } from "@/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Vue d'ensemble" />
      <div className="card">
        <EmptyState title="En construction" />
      </div>
    </>
  );
}
