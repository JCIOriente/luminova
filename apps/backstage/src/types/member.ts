export type Member = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profilePicture?: File;
  totalPoints: number;
  active: boolean;
};
