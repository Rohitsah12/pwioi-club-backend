export enum RoleType {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  OPS = "OPS",
  BATCHOPS = "BATCHOPS",
}
export enum TeacherRole {
  TEACHER = "TEACHER",
  ASSISTANT_TEACHER = "ASSISTANT_TEACHER",
}
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "OPS" | "BATCHOPS" | "TEACHER" | "ASSISTANT_TEACHER" | "STUDENT";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  designation?: string;
}
