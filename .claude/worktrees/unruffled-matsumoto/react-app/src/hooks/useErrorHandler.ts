import { useCallback } from 'react';
import { AxiosError } from 'axios';

export const useErrorHandler = () => {
    const handleError = useCallback((error: unknown, context: string) => {
        let message = 'An unexpected error occurred.';

        if (error instanceof AxiosError) {
            if (error.response?.data?.detail) {
                message = `${context}: ${error.response.data.detail}`;
            } else if (error.message) {
                message = `${context}: ${error.message}`;
            }
        } else if (error instanceof Error) {
            message = `${context}: ${error.message}`;
        }

        // In a real app, this would use a Toast component
        alert(message);
        console.error(message, error);
        return message;
    }, []);

    return { handleError };
};
