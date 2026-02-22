import React, { useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useIAMStore } from '../../store/iamStore';
import styles from './IAM.module.css';
import { formatRoleName } from '../../utils/formatters';

const PermissionMatrix: React.FC = () => {
    const { t } = useLanguage();
    const { roles, permissions, loading } = useIAMStore();

    const groupedPermissions = useMemo(() => {
        return permissions.reduce((acc, perm) => {
            const moduleName = (perm.code.split(':')[0] || 'OTHER').toUpperCase();
            if (!acc[moduleName]) acc[moduleName] = [];
            acc[moduleName].push(perm);
            return acc;
        }, {} as Record<string, typeof permissions>);
    }, [permissions]);

    if (loading && roles.length === 0) {
        return (
            <div className={styles.loadingSkeleton}>
                <div className={styles.skeletonRow}></div>
                <div className={styles.skeletonRow}></div>
                <div className={styles.skeletonRow}></div>
            </div>
        );
    }

    return (
        <div className={styles.content}>
            <div className={styles.contentHeader}>
                <h2>{t('iam.permissions')}</h2>
                <p className={styles.subtitle}>{t('iam.permissionsDesc') || 'View all permissions and their corresponding roles'}</p>
            </div>

            <div className={styles.permissionsTableContainer}>
                <table className={styles.permissionsTable}>
                    <thead>
                        <tr>
                            <th>{t('iam.permissionsLabel')}</th>
                            <th>{t('iam.description')}</th>
                            {roles.map((role) => (
                                <th key={role.id} className={styles.roleColumn}>
                                    {formatRoleName(role.name)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(groupedPermissions).map(([moduleName, modulePerms]) => (
                            <React.Fragment key={moduleName}>
                                <tr className={styles.groupHeaderRow}>
                                    <td colSpan={2 + roles.length}>
                                        <span className={styles.groupTitle}>{moduleName} MODULE</span>
                                    </td>
                                </tr>
                                {modulePerms.map((perm) => (
                                    <tr key={perm.code}>
                                        <td className={styles.permissionName}>
                                            <span className={styles.permissionTag}>{perm.code}</span>
                                        </td>
                                        <td className={styles.permissionDesc}>
                                            {perm.description}
                                        </td>
                                        {roles.map((role) => (
                                            <td key={role.id} className={styles.checkCell}>
                                                {role.permissions.includes(perm.code) ? (
                                                    <span className={styles.checkMark}>✓</span>
                                                ) : (
                                                    <span className={styles.checkEmpty}>—</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.summarySection}>
                <h3>{t('iam.permissionStats')}</h3>
                <div className={styles.summaryGrid}>
                    {roles.map((role) => (
                        <div key={role.id} className={styles.summaryCard}>
                            <div className={styles.summaryHeader}>
                                <span className={styles.roleBadge}>{formatRoleName(role.name)}</span>
                                <span className={styles.permissionCount}>
                                    {role.permissions.length} perms
                                </span>
                            </div>
                            <div className={styles.summaryPermissions}>
                                {role.permissions.map((permCode) => {
                                    const perm = permissions.find(p => p.code === permCode);
                                    return (
                                        <span key={permCode} className={styles.permissionTag} title={permCode}>
                                            {perm?.description || permCode}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PermissionMatrix;
