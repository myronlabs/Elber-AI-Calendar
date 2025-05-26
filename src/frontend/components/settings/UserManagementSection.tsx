import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import Button from '../common/Button';

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

const UserManagementSection: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Using Supabase to fetch users - this requires admin privileges
      const { data, error } = await supabase.from('auth.users')
        .select('id, email, created_at, last_sign_in_at')
        .order('last_sign_in_at', { ascending: false });
      
      if (error) throw error;
      
      setUsers(data || []);
    } catch (e: unknown) {
      console.error('Error fetching users:', e);
      if (e instanceof Error) {
      setError(e.message || 'Failed to fetch users');
      } else {
        setError('Failed to fetch users');
      }
      
      // If the above method fails (likely due to permissions), try the RPC method
      try {
        const { data, error } = await supabase.rpc('get_all_users');
        if (error) throw error;
        setUsers(data || []);
      } catch (rpcError: unknown) {
        console.error('Error fetching users via RPC:', rpcError);
        if (rpcError instanceof Error) {
        setError(rpcError.message || 'Failed to fetch users');
        } else {
          setError('Failed to fetch users via RPC');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${userEmail}? This action is irreversible.`)) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      // Call the SQL function we created to delete the user and all related data
      const { error } = await supabase.rpc('delete_user_complete', {
        user_id: userId
      });
      
      if (error) throw error;
      
      setSuccessMessage(`User ${userEmail} has been deleted successfully`);
      
      // Refresh the user list
      fetchUsers();
    } catch (e: unknown) {
      console.error('Error deleting user:', e);
      if (e instanceof Error) {
      setError(e.message || 'Failed to delete user. Please try again.');
      } else {
        setError('Failed to delete user. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-management-section">
      <h2>User Management</h2>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}
      
      {successMessage && (
        <div className="success-message">
          <p>{successMessage}</p>
        </div>
      )}
      
      <div className="actions">
        <Button
          variant="secondary"
          onClick={fetchUsers}
          disabled={loading}
        >
          Refresh User List
        </Button>
      </div>
      
      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created At</th>
                <th>Last Sign In</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4}>No users found or you don&apos;t have permission to view users</td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{new Date(user.created_at).toLocaleString()}</td>
                    <td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}</td>
                    <td>
                      <Button
                        variant="danger"
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={loading}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="admin-instructions">
        <h3>Administrator Instructions</h3>
        <p>To delete a user:</p>
        <ol>
          <li>Find the user in the list above</li>
          <li>Click the &quot;Delete&quot; button next to their email</li>
          <li>Confirm the deletion when prompted</li>
        </ol>
        <p><strong>Warning:</strong> Deleting a user will remove all their data from the system and cannot be undone.</p>
      </div>
    </div>
  );
};

export default UserManagementSection; 