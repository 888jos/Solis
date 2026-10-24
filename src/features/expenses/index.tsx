import { EmptyState, PageHeader } from "@/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Dépenses" />
      <div className="card">
        <EmptyState title="En construction" />
      </div>
    </>
  );
}
