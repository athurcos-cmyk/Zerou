import type { UserProfile } from '../types/contracts';
import { getAvatarById } from './avatarCatalog';

interface UserAvatarProps {
  profile: Pick<UserProfile, 'name' | 'avatarStyle'> | null | undefined;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function UserAvatar({ profile, size = 32, className }: UserAvatarProps) {
  const avatarStyle = profile?.avatarStyle;

  if (avatarStyle) {
    const avatar = getAvatarById(avatarStyle);
    if (avatar) {
      return (
        <span
          className={`user-avatar user-avatar--cartoon${className ? ` ${className}` : ''}`}
          style={{ width: size, height: size }}
          aria-label={profile?.name ?? 'Usuário'}
        >
          <img src={avatar.src} alt="" width={size} height={size} />
        </span>
      );
    }
  }

  const name = profile?.name ?? '';
  return (
    <span
      className={`user-avatar user-avatar--initials${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-label={name || 'Usuário'}
    >
      {name ? initials(name) : '?'}
    </span>
  );
}
