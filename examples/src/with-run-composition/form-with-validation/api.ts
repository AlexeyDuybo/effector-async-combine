import { createEffect } from "effector";

export type User = { name: string; email: string };
export type ValidationResult =
  | { isValid: true }
  | { isValid: false; message: string };

export const getUser = async () => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  const userRaw = localStorage.getItem("_user");

  const user: User = userRaw
    ? JSON.parse(userRaw)
    : { name: "Ivan", email: "ivan@mail.com" };

  if (!userRaw) {
    localStorage.setItem("_user", JSON.stringify(user));
  }

  return user;
};

export const updateUserFx = createEffect(async (update: User) => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));
  localStorage.setItem("_user", JSON.stringify(update));

  return update;
});

export const validateUserName = async (
  name: string,
): Promise<ValidationResult> => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));

  if (name.length < 4) {
    return {
      isValid: false,
      message: "Name must be at least 4 characters long",
    };
  }
  if (name.length > 20) {
    return {
      isValid: false,
      message: "Name must be at most 20 characters long",
    };
  }
  return { isValid: true };
};

export const validateUserEmail = async (
  email: string,
): Promise<ValidationResult> => {
  await new Promise((res) => setTimeout(res, Math.random() * 1000));

  if (!email.includes("@")) {
    return { isValid: false, message: "Email must contain @" };
  }

  return { isValid: true };
};
