import { getActiveClass, getTeacher } from "@/lib/teacher";
import { AppNavClient, type HeaderPlace } from "./AppNavClient";

export async function AppNav({ place }: { place?: HeaderPlace | null } = {}) {
  if (place === undefined) {
    const teacher = await getTeacher();
    const active = teacher ? await getActiveClass(teacher.id) : null;
    place = active ? {
      id: active.id,
      groupType: active.groupType,
      name: active.name,
      groundsName: active.lat != null && active.lng != null ? active.groundsName : "location not set",
    } : null;
  }
  return <AppNavClient place={place} />;
}
