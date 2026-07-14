import { avatarCatalog } from './avatarCatalog';
import { UserAvatar } from './UserAvatar';
import type { UserProfile } from '../types/contracts';

interface AvatarPickerProps {
  profile: Pick<UserProfile, 'name' | 'avatarStyle'> | null | undefined;
  onSelect: (avatarId: string | undefined) => void;
  disabled?: boolean;
}

export function AvatarPicker({ profile, onSelect, disabled }: AvatarPickerProps) {
  const currentId = profile?.avatarStyle;

  return (
    <div className="avatar-picker">
      <div className="avatar-picker__preview">
        <p className="avatar-picker__label">Seu avatar</p>
        <UserAvatar profile={profile} size={56} />
        {!currentId && (
          <p className="text-secondary" style={{ fontSize: '0.82rem', margin: '0.35rem 0 0' }}>
            Iniciais do nome
          </p>
        )}
      </div>

      <p className="avatar-picker__label" style={{ marginTop: '1rem' }}>Escolha um estilo</p>

      <div className="avatar-picker__grid">
        <button
          type="button"
          className={`avatar-picker__option${!currentId ? ' avatar-picker__option--selected' : ''}`}
          onClick={() => onSelect(undefined)}
          disabled={disabled}
          aria-label="Sem avatar (iniciais)"
        >
          <UserAvatar profile={{ name: profile?.name ?? '?', avatarStyle: undefined }} size={40} />
        </button>

        {avatarCatalog.map((avatar, index) => (
          <button
            key={avatar.id}
            type="button"
            className={`avatar-picker__option${currentId === avatar.id ? ' avatar-picker__option--selected' : ''}`}
            onClick={() => onSelect(avatar.id)}
            disabled={disabled}
            aria-label={`Avatar ${index + 1}`}
          >
            <span className="avatar-picker__svg-wrap">
              <img src={avatar.src} alt="" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
