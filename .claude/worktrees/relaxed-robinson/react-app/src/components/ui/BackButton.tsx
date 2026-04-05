import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label?: string;
    to?: string;
}

export const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
    ({ className, label, to = '/', onClick, ...props }, ref) => {
        const navigate = useNavigate();
        const { t } = useLanguage();

        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (onClick) {
                onClick(e);
            } else {
                navigate(to);
            }
        };

        return (
            <Button
                ref={ref}
                type="button"
                variant="default"
                className={cn(
                    "bg-[#11998e] hover:bg-[#0d7a72] text-white flex items-center gap-2 px-4 py-2 rounded-md transition-colors",
                    className
                )}
                onClick={handleClick}
                {...props}
            >
                <ArrowLeft className="h-4 w-4" />
                {label || t('common.back') || 'Back'}
            </Button>
        );
    }
);

BackButton.displayName = 'BackButton';
