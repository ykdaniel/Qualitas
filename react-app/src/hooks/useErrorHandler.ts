import { useCallback } from 'react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

export const useErrorHandler = () => {
    const handleError = useCallback((error: unknown, context: string) => {
        let message = 'An unexpected error occurred.';

        if (error instanceof AxiosError) {
            if (error.response?.status === 401) {
                return '';
            }
            if (error.response?.data?.detail) {
                message = `${context}: ${error.response.data.detail}`;
            } else if (error.message) {
                message = `${context}: ${error.message}`;
            }
        } else if (error instanceof Error) {
            message = `${context}: ${error.message}`;
        }

        toast.error(message);
        console.error(message, error);
        return message;
    }, []);

    return { handleError };
};
