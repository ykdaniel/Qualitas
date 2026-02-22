import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './IAM.module.css';
import { BackButton } from '@/components/ui/BackButton';



import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createUserColumns, createRoleColumns, User, Role } from './columns';
import {
  getUsers, getRoles, deleteUser, deleteRole, createUser, updateUser, createRole, updateRole,
  User as ApiUser, Role as ApiRole
} from '../../services/api';

// Remove storage keys and defaults as we use API now



const IAM: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { handleError } = useErrorHandler();
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Search States
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [usersData, rolesData] = await Promise.all([
          getUsers(),
          getRoles()
        ]);

        // Map API User to UI User
        const mappedUsers: User[] = usersData.map(u => ({
          id: u.id.toString(), // UI uses string ID
          name: u.username, // UI uses 'name', API uses 'username'
          email: u.email,
          role: u.role_name || 'user', // API might return role_name
          status: u.is_active ? 'active' : 'inactive',
          createdAt: new Date().toISOString().split('T')[0] // Placeholder
        }));

        // Map API Role to UI Role
        const mappedRoles: Role[] = rolesData.map(r => ({
          id: r.id.toString(),
          name: r.name,
          description: r.description || '',
          permissions: r.permissions // Assumption: permission codes match
        }));

        setUsers(mappedUsers);
        setRoles(mappedRoles);
      } catch (error) {
        handleError(error, t('iam.fetchError') || 'Failed to fetch IAM data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [t, handleError]);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'user',
    status: 'active' as 'active' | 'inactive',
    password: '',
    confirmPassword: '',
  });
  const [resetPassword, setResetPassword] = useState(false);

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'user' | 'role' | null; id: string | null; message: string }>({
    isOpen: false,
    type: null,
    id: null,
    message: '',
  });

  const availablePermissions = [
    { id: 'read', label: t('iam.perm.read') },
    { id: 'write', label: t('iam.perm.write') },
    { id: 'delete', label: t('iam.perm.delete') },
    { id: 'manage_users', label: t('iam.perm.manageUsers') },
    { id: 'manage_roles', label: t('iam.perm.manageRoles') },
  ];

  // Filtering Logic
  const filteredUsers = React.useMemo(() => {
    if (!userSearchQuery.trim()) return users;
    const query = userSearchQuery.toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    );
  }, [users, userSearchQuery]);

  const filteredRoles = React.useMemo(() => {
    if (!roleSearchQuery.trim()) return roles;
    const query = roleSearchQuery.toLowerCase();
    return roles.filter(r =>
      r.name.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query)
    );
  }, [roles, roleSearchQuery]);


  const handleAddUser = () => {
    setEditingUser(null);
    setResetPassword(false);
    setUserForm({ name: '', email: '', role: 'user', status: 'active', password: '', confirmPassword: '' });
    setIsUserModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setResetPassword(false);
    setUserForm({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      password: '',
      confirmPassword: '',
    });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      // Find role_id from role name
      const selectedRole = roles.find(r => r.name === userForm.role);
      const roleId = selectedRole ? parseInt(selectedRole.id) : 0; // Default or handle error

      // 密碼驗證：新增時必填，編輯時若勾選重設密碼則必填
      const needsPassword = !editingUser || resetPassword;
      if (needsPassword) {
        if (!userForm.password || userForm.password.length < 8) {
          handleError(new Error('Password must be at least 8 characters'), t('iam.passwordTooShort') || 'Password must be at least 8 characters');
          return;
        }
        if (userForm.password !== userForm.confirmPassword) {
          handleError(new Error('Passwords do not match'), t('iam.passwordMismatch') || 'Passwords do not match');
          return;
        }
      }

      const payload = {
        username: userForm.name,
        email: userForm.email,
        role_id: roleId,
        is_active: userForm.status === 'active',
        password: needsPassword ? userForm.password : undefined,
      };

      if (editingUser) {
        const id = parseInt(editingUser.id);
        const updatedApiUser = await updateUser(id, payload);
        // Update local state or refetch
        setUsers(users.map(u => u.id === editingUser.id ? {
          ...u,
          name: updatedApiUser.username,
          email: updatedApiUser.email,
          role: updatedApiUser.role_name || userForm.role,
          status: updatedApiUser.is_active ? 'active' : 'inactive'
        } : u));
      } else {
        const newApiUser = await createUser(payload);
        const newUser: User = {
          id: newApiUser.id.toString(),
          name: newApiUser.username,
          email: newApiUser.email,
          role: newApiUser.role_name || userForm.role,
          status: newApiUser.is_active ? 'active' : 'inactive',
          createdAt: new Date().toISOString().split('T')[0],
        };
        setUsers([...users, newUser]);
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      handleError(error, t('iam.saveUserError') || 'Failed to save user');
    }
  };

  const handleDeleteUserClick = (id: string) => {
    setDeleteModal({ isOpen: true, type: 'user', id, message: t('common.confirmDelete') });
  };

  const handleAddRole = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', permissions: [] });
    setIsRoleModalOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    try {
      const payload = {
        name: roleForm.name,
        description: roleForm.description,
        permissions: roleForm.permissions
      };

      if (editingRole) {
        const id = parseInt(editingRole.id);
        const updatedApiRole = await updateRole(id, payload);
        setRoles(roles.map(r => r.id === editingRole.id ? {
          ...r,
          name: updatedApiRole.name,
          description: updatedApiRole.description || '',
          permissions: updatedApiRole.permissions
        } : r));
      } else {
        const newApiRole = await createRole(payload);
        const newRole: Role = {
          id: newApiRole.id.toString(),
          name: newApiRole.name,
          description: newApiRole.description || '',
          permissions: newApiRole.permissions
        };
        setRoles([...roles, newRole]);
      }
      setIsRoleModalOpen(false);
      setEditingRole(null);
    } catch (error) {
      handleError(error, t('iam.saveRoleError') || 'Failed to save role');
    }
  };

  const handleDeleteRoleClick = (id: string) => {
    setDeleteModal({ isOpen: true, type: 'role', id, message: t('common.confirmDelete') });
  };

  const handleDeleteConfirm = async () => {
    try {
      const id = deleteModal.id ? parseInt(deleteModal.id) : null;
      if (id !== null && !isNaN(id)) {
        if (deleteModal.type === 'user') {
          await deleteUser(id);
          setUsers(users.filter(u => u.id !== deleteModal.id));
        } else if (deleteModal.type === 'role') {
          await deleteRole(id);
          setRoles(roles.filter(r => r.id !== deleteModal.id));
        }
      }
      setDeleteModal({ isOpen: false, type: null, id: null, message: '' });
    } catch (error) {
      handleError(error, t('iam.deleteError') || 'Failed to delete item');
    }
  };

  const togglePermission = (permissionId: string) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('iam.title')}</h1>
        </div>
        <div className={styles.headerRight}>
          {activeTab === 'users' && (
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('iam.searchUser')}
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
            />
          )}
          {activeTab === 'roles' && (
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('iam.searchRole')}
              value={roleSearchQuery}
              onChange={(e) => setRoleSearchQuery(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'users' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('users')}
        >
          {t('iam.users')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'roles' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          {t('iam.roles')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'permissions' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          {t('iam.permissions')}
        </button>
      </div>

      {activeTab === 'users' && (
        <div className={styles.content}>
          <DataTable
            title={t('iam.userList')}
            actions={
              <button className={styles.addNewButton} onClick={handleAddUser}>
                {t('iam.addUser')}
              </button>
            }
            columns={createUserColumns(handleEditUser, handleDeleteUserClick, roles, t)}
            data={filteredUsers}
            searchKey=""
            getRowId={(row) => row.id}
          />
        </div>
      )}

      {activeTab === 'roles' && (
        <div className={styles.content}>
          <DataTable
            title={t('iam.roleList')}
            actions={
              <button className={styles.addNewButton} onClick={handleAddRole}>
                {t('iam.addRole')}
              </button>
            }
            columns={createRoleColumns(handleEditRole, handleDeleteRoleClick, availablePermissions, t)}
            data={filteredRoles}
            searchKey=""
            getRowId={(row) => row.id}
          />
        </div>
      )}

      {activeTab === 'permissions' && (
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
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availablePermissions.map((perm) => (
                  <tr key={perm.id}>
                    <td className={styles.permissionName}>
                      <span className={styles.permissionTag}>{perm.label}</span>
                    </td>
                    <td className={styles.permissionDesc}>
                      {perm.id === 'read' && t('iam.permDesc.read')}
                      {perm.id === 'write' && t('iam.permDesc.write')}
                      {perm.id === 'delete' && t('iam.permDesc.delete')}
                      {perm.id === 'manage_users' && t('iam.permDesc.manageUsers')}
                      {perm.id === 'manage_roles' && t('iam.permDesc.manageRoles')}
                    </td>
                    {roles.map((role) => (
                      <td key={role.id} className={styles.checkCell}>
                        {role.permissions.includes(perm.id) ? (
                          <span className={styles.checkMark}>✓</span>
                        ) : (
                          <span className={styles.checkEmpty}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
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
                    <span className={styles.roleBadge}>{role.name}</span>
                    <span className={styles.permissionCount}>
                      {t('iam.countPermissions', { count: role.permissions.length })}
                    </span>
                  </div>
                  <div className={styles.summaryPermissions}>
                    {role.permissions.map((perm) => (
                      <span key={perm} className={styles.permissionTag}>
                        {availablePermissions.find(p => p.id === perm)?.label || perm}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? t('iam.editUser') : t('iam.addUser')}</h2>
            <div className={styles.formGroup}>
              <label>{t('iam.name')}</label>
              <input
                type="text"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                placeholder={t('iam.placeholder.name')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('iam.email')}</label>
              <input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder={t('iam.placeholder.email')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('iam.role')}</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>{t('iam.status')}</label>
              <select
                value={userForm.status}
                onChange={(e) =>
                  setUserForm({ ...userForm, status: e.target.value as 'active' | 'inactive' })
                }
              >
                <option value="active">{t('iam.status.active')}</option>
                <option value="inactive">{t('iam.status.inactive')}</option>
              </select>
            </div>
            {/* 密碼欄位 - 新增時必填，編輯時可選重設 */}
            {editingUser && (
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={resetPassword}
                    onChange={(e) => {
                      setResetPassword(e.target.checked);
                      if (!e.target.checked) {
                        setUserForm({ ...userForm, password: '', confirmPassword: '' });
                      }
                    }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span>{t('iam.resetPassword') || 'Reset Password'}</span>
                </label>
              </div>
            )}
            {(!editingUser || resetPassword) && (
              <>
                <div className={styles.formGroup}>
                  <label>{t('iam.password')}</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder={t('iam.placeholder.password') || 'Enter password (min 8 chars)'}
                    required
                    minLength={8}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('iam.confirmPassword')}</label>
                  <input
                    type="password"
                    value={userForm.confirmPassword}
                    onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                    placeholder={t('iam.placeholder.confirmPassword') || 'Confirm password'}
                    required
                  />
                  {userForm.password && userForm.confirmPassword && userForm.password !== userForm.confirmPassword && (
                    <span style={{ color: 'red', fontSize: '12px' }}>{t('iam.passwordMismatch') || 'Passwords do not match'}</span>
                  )}
                </div>
              </>
            )}
            <div className={styles.formActions}>
              <button className={styles.saveButton} onClick={handleSaveUser}>
                {editingUser ? t('common.save') : t('common.add')}
              </button>
              <button
                className={styles.cancelButton}
                onClick={() => setIsUserModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {isRoleModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>{editingRole ? t('iam.editRole') : t('iam.addRole')}</h2>
            <div className={styles.formGroup}>
              <label>{t('iam.roleName')}</label>
              <input
                type="text"
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                placeholder={t('iam.placeholder.roleName')}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('iam.description')}</label>
              <textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder={t('iam.placeholder.roleDesc')}
                rows={3}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('iam.permissionsLabel')}</label>
              <div className={styles.permissionsGrid}>
                {availablePermissions.map((perm) => (
                  <label key={perm.id} className={styles.permissionCheckbox}>
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.saveButton} onClick={handleSaveRole}>
                {editingRole ? t('common.save') : t('common.add')}
              </button>
              <button
                className={styles.cancelButton}
                onClick={() => setIsRoleModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('common.confirmDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, type: null, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      )}
    </div>
  );
};

export default IAM;
