export interface AvatarOption {
  id: string;
  label: string;
  src: string;
}

export const avatarCatalog: AvatarOption[] = [
  { id: 'ana', label: 'Ana', src: '/avatars/ana.jpg' },
  { id: 'beatriz', label: 'Beatriz', src: '/avatars/beatriz.jpg' },
  { id: 'carla', label: 'Carla', src: '/avatars/carla.jpg' },
  { id: 'duda', label: 'Duda', src: '/avatars/duda.jpg' },
  { id: 'elisa', label: 'Elisa', src: '/avatars/elisa.jpg' },
  { id: 'fernanda', label: 'Fernanda', src: '/avatars/fernanda.jpg' },
  { id: 'gabriela', label: 'Gabriela', src: '/avatars/gabriela.jpg' },
  { id: 'helena', label: 'Helena', src: '/avatars/helena.jpg' },
  { id: 'iris', label: 'Íris', src: '/avatars/iris.jpg' },
  { id: 'julia', label: 'Julia', src: '/avatars/julia.jpg' },
  { id: 'larissa', label: 'Larissa', src: '/avatars/larissa.jpg' },
  { id: 'manuela', label: 'Manuela', src: '/avatars/manuela.jpg' },
  { id: 'bruno', label: 'Bruno', src: '/avatars/bruno.jpg' },
  { id: 'caio', label: 'Caio', src: '/avatars/caio.jpg' },
  { id: 'diego', label: 'Diego', src: '/avatars/diego.jpg' },
  { id: 'enzo', label: 'Enzo', src: '/avatars/enzo.jpg' },
  { id: 'felipe', label: 'Felipe', src: '/avatars/felipe.jpg' },
  { id: 'gustavo', label: 'Gustavo', src: '/avatars/gustavo.jpg' },
  { id: 'hugo', label: 'Hugo', src: '/avatars/hugo.jpg' },
  { id: 'igor', label: 'Igor', src: '/avatars/igor.jpg' },
  { id: 'joaquim', label: 'Joaquim', src: '/avatars/joaquim.jpg' },
  { id: 'lucas', label: 'Lucas', src: '/avatars/lucas.jpg' },
  { id: 'rafael', label: 'Rafael', src: '/avatars/rafael.jpg' },
  { id: 'theo', label: 'Theo', src: '/avatars/theo.jpg' }
];

export function getAvatarById(id: string): AvatarOption | undefined {
  return avatarCatalog.find((a) => a.id === id);
}
