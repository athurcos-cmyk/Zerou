import type { WorkspaceMembership } from '../../types/contracts';

export function memberLabel(member: WorkspaceMembership | undefined, currentUserId?: string) {
  if (!member) return 'Parceiro(a)';
  if (member.userId === currentUserId) return 'Você';
  return member.displayName || (member.role === 'owner' ? 'Dono' : 'Parceiro(a)');
}
