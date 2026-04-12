import api from './api';
import { KMArticle, KMArticleCreate, KMArticleUpdate } from '../types/km';

export const kmService = {
    getAll: async (params?: { skip?: number; limit?: number; category?: string; search?: string }) => {
        const response = await api.get<KMArticle[]>('/km/', { params });
        return response.data;
    },

    getById: async (id: string) => {
        const response = await api.get<KMArticle>(`/km/${id}`);
        return response.data;
    },

    create: async (data: KMArticleCreate) => {
        const response = await api.post<KMArticle>('/km/', data);
        return response.data;
    },

    update: async (id: string, article: KMArticleUpdate): Promise<KMArticle> => {
        const response = await api.put<KMArticle>(`/km/${id}`, article);
        return response.data;
    },

    getHistory: async (id: string): Promise<any[]> => {
        const response = await api.get(`/km/${id}/history`);
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        const response = await api.delete(`/km/${id}`);
        return response.data;
    },

    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<{ url: string }>('/km/upload-image/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data.url;
    }
};
