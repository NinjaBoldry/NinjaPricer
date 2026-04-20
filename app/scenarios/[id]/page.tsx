import { redirect } from 'next/navigation';

export default function ScenarioPage({ params }: { params: { id: string } }) {
  redirect(`/scenarios/${params.id}/notes`);
}
