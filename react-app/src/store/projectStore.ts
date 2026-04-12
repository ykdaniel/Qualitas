import { create } from 'zustand';
import {
    getProjects,
    createProject,
    updateProject as updateProjectApi,
    deleteProject as deleteProjectApi,
    ProjectApi,
    CreateProjectPayload,
    UpdateProjectPayload,
} from '../services/api';

export interface Project {
    id: string;
    name: string;
    code: string;
    description: string;
    owner: string;
    created_at: string | null;
}

const mapApiToInternal = (data: ProjectApi): Project => ({
    id: data.id,
    name: data.name,
    code: data.code || '',
    description: data.description || '',
    owner: data.owner || '',
    created_at: data.created_at || null,
});

const CURRENT_PROJECT_KEY = 'qualitas_current_project';

const loadCurrentProject = (): Project | null => {
    try {
        const raw = localStorage.getItem(CURRENT_PROJECT_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    return null;
};

const persistCurrentProject = (project: Project | null) => {
    if (project) {
        localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project));
    } else {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
};

interface ProjectState {
    projectList: Project[];
    currentProject: Project | null;
    error: string | null;
    fetchProjects: () => Promise<void>;
    setCurrentProject: (project: Project | null) => void;
    addProject: (data: CreateProjectPayload) => Promise<void>;
    updateProject: (id: string, data: UpdateProjectPayload) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, _get) => ({
    projectList: [],
    currentProject: loadCurrentProject(),
    error: null,

    setCurrentProject: (project: Project | null) => {
        persistCurrentProject(project);
        set({ currentProject: project });
    },

    fetchProjects: async () => {
        try {
            const data = await getProjects();
            set({ projectList: data.map(mapApiToInternal) });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to fetch projects' });
        }
    },

    addProject: async (data) => {
        try {
            const newProject = await createProject(data);
            set(state => ({ projectList: [...state.projectList, mapApiToInternal(newProject)] }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed to add project' });
            throw err;
        }
    },

    updateProject: async (id, data) => {
        try {
            const updated = await updateProjectApi(id, data);
            set(state => ({
                projectList: state.projectList.map(p => p.id === id ? mapApiToInternal(updated) : p),
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed to update project' });
            throw err;
        }
    },

    deleteProject: async (id) => {
        try {
            await deleteProjectApi(id);
            set(state => ({ projectList: state.projectList.filter(p => p.id !== id) }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed to delete project' });
            throw err;
        }
    },
}));
