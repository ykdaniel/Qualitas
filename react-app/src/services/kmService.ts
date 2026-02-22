import axios from 'axios';
import { KMArticle, KMArticleCreate, KMArticleUpdate } from '../types/km';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const kmService = {
    getAll: async (params?: { skip?: number; limit?: number; category?: string; search?: string }) => {
        const response = await axios.get<KMArticle[]>(`${API_URL}/km/`, { ...getHeaders(), params });
        return response.data;
    },

    getById: async (id: string) => {
        const response = await axios.get<KMArticle>(`${API_URL}/km/${id}`, getHeaders());
        return response.data;
    },

    create: async (data: KMArticleCreate) => {
        const response = await axios.post<KMArticle>(`${API_URL}/km/`, data, getHeaders());
        return response.data;
    },

    update: async (id: string, article: KMArticleUpdate): Promise<KMArticle> => {
        const response = await axios.put<KMArticle>(`${API_URL}/km/${id}`, article, getHeaders());
        return response.data;
    },

    getHistory: async (id: string): Promise<any[]> => {
        const response = await axios.get(`${API_URL}/km/${id}/history`, getHeaders());
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        const response = await axios.delete(`${API_URL}/km/${id}`, getHeaders());
        return response.data;
    },

    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post<{ url: string }>(`${API_URL}/km/upload-image/`, formData, {
            headers: {
                ...getHeaders().headers,
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data.url;
    }
};
