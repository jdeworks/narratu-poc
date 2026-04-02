import localforage from "localforage";
import type { CharacterProfile, TextSegment } from "../stores/project-store";

export interface SavedProject {
  id: string;
  name: string;
  storyText: string;
  characters: CharacterProfile[];
  segments: TextSegment[];
  createdAt: number;
  updatedAt: number;
}

const db = localforage.createInstance({
  name: "narratu",
  storeName: "projects",
});

export async function listProjects(): Promise<SavedProject[]> {
  const projects: SavedProject[] = [];
  await db.iterate<SavedProject, void>((value) => {
    projects.push(value);
  });
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<SavedProject | null> {
  return db.getItem<SavedProject>(id);
}

export async function saveProject(project: SavedProject): Promise<void> {
  await db.setItem(project.id, project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.removeItem(id);
}
