import type { TeacherReference } from "@/lib/outside/place-evidence";
export function TeacherReferences({ references = [] }: { references?: TeacherReference[] }) {
  if (!references.length) return null;
  return <section className="brief-block" aria-labelledby="teacher-references"><h2 id="teacher-references" className="brief-heading">References for your investigation</h2><p>Compare these sources with observations the class makes. Each source describes its own place, date and method.</p>{references.map(card => <article key={card.id}><h3>{card.title}</h3><p>{card.detail}</p><p>{card.scope}</p><p>{card.date}</p><p>{card.attribution}</p><ul>{card.links.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul></article>)}</section>;
}
