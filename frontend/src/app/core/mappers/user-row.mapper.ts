import { User, userHasRole } from '../models/auth.models';

export interface UserRowViewModel {
  id: string;
  user: User;
  statusLabel: 'active' | 'disabled';
  canEdit: boolean;
}

export const mapUserRow = (
  user: User,
  currentUser: Pick<User, 'role' | 'roles'> | null | undefined,
): UserRowViewModel => ({
  id: user.id,
  user,
  statusLabel: user.isActive ? 'active' : 'disabled',
  canEdit:
    !userHasRole(user, 'super_admin') &&
    (!userHasRole(user, 'admin') || userHasRole(currentUser, 'super_admin')),
});
