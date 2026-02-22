import React, { ReactNode } from 'react';
import { ContractorsProvider } from '../../context/ContractorsContext';
import { NOIProvider } from '../../context/NOIContext';
import { ITPProvider } from '../../context/ITPContext';
import { NCRProvider } from '../../context/NCRContext';
import { ITRProvider } from '../../context/ITRContext';
import { PQPProvider } from '../../context/PQPContext';
import { OBSProvider } from '../../context/OBSContext';
import { FollowUpProvider } from '../../context/FollowUpContext';
import { AuditProvider } from '../../context/AuditContext';
import { FATProvider } from '../../context/FATContext';
import { IAMProvider } from '../../context/IAMContext';
import { ChecklistProvider } from '../../context/ChecklistContext';

interface AppProvidersProps {
    children: ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    return (
        <ContractorsProvider>
            <ITPProvider>
                <NOIProvider>
                    <NCRProvider>
                        <ITRProvider>
                            <PQPProvider>
                                <OBSProvider>
                                    <FollowUpProvider>
                                        <AuditProvider>
                                            <FATProvider>
                                                <IAMProvider>
                                                    <ChecklistProvider>
                                                        {children}
                                                    </ChecklistProvider>
                                                </IAMProvider>
                                            </FATProvider>
                                        </AuditProvider>
                                    </FollowUpProvider>
                                </OBSProvider>
                            </PQPProvider>
                        </ITRProvider>
                    </NCRProvider>
                </NOIProvider>
            </ITPProvider>
        </ContractorsProvider>
    );
};
