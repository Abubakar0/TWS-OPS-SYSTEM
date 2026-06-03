import { User, UserRole, userHasRole } from '../models/auth.models';

export interface UserRowViewModel {
  id: string;
  user: User;
  statusLabel: 'active' | 'disabled';
  canEdit: boolean;
}

export const mapUserRow = (user: User, currentUserRole: UserRole | undefined): UserRowViewModel => ({
  id: user.id,
  user,
  statusLabel: user.isActive ? 'active' : 'disabled',
  canEdit: !userHasRole(user, 'admin') || currentUserRole === 'super_admin',
});
