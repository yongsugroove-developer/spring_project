import type {
  PlannerData,
  ResolvedRoutineItem,
  RoutineItem,
  RoutineTaskTemplate,
} from "./types.js";

export function buildRoutineTaskTemplateMap(
  data: Pick<PlannerData, "routineTaskTemplates">,
): Map<string, RoutineTaskTemplate> {
  return new Map(
    data.routineTaskTemplates.map((template) => [template.id, template] satisfies [string, RoutineTaskTemplate]),
  );
}

export function resolveRoutineItem(
  item: RoutineItem,
  templateMap: Map<string, RoutineTaskTemplate>,
): ResolvedRoutineItem | null {
  const template = templateMap.get(item.templateId);
  if (!template) {
    return null;
  }

  return {
    ...item,
    title: template.title,
    trackingType: template.trackingType,
    targetCount: template.targetCount,
  };
}

export function resolveRoutineItems(
  data: Pick<PlannerData, "routineItems" | "routineTaskTemplates">,
  routineId?: string,
): ResolvedRoutineItem[] {
  const templateMap = buildRoutineTaskTemplateMap(data);
  return data.routineItems
    .filter((item) => (routineId ? item.routineId === routineId : true))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => resolveRoutineItem(item, templateMap))
    .filter((item): item is ResolvedRoutineItem => item !== null);
}
