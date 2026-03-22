import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultPlannerData } from "../../src/planner/defaultData.js";
import type { PlannerData } from "../../src/planner/types.js";

export async function createTempPlannerFile(initialData: PlannerData = createDefaultPlannerData()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "my-planner-"));
  const filePath = path.join(directory, "planner-data.json");
  await writeFile(filePath, JSON.stringify(initialData, null, 2), "utf8");

  return {
    filePath,
    async cleanup() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}
