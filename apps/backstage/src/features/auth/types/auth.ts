type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
};

type LoginCredentials = {
  email: string;
  password: string;
};

export type { AuthUser, LoginCredentials };