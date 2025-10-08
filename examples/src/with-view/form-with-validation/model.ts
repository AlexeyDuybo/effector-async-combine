import { createEvent, sample } from "effector";
import { asyncCombine } from "../../../../src";
import * as api from "./api";
import { createGate } from "effector-react";

export const pageGate = createGate();

export const userAsync = asyncCombine(pageGate.status, (isPageOpen) => {
  if (!isPageOpen) throw undefined;
  return api.getUserFx();
});

export const draftNameAsync = asyncCombine(userAsync, (user) => {
  return user.name;
});

export const draftEmailAsync = asyncCombine(userAsync, (user) => {
  return user.email;
});

export const draftNameValidationAsync = asyncCombine(
  { draftNameAsync, userAsync },
  async ({ draftName, user }): Promise<api.ValidationResult> => {
    if (draftName === user?.name)
      return {
        isValid: true,
      };
    return api.validateUserNameFx(draftName);
  },
);

export const draftEmailValidationAsync = asyncCombine(
  { draftEmailAsync, userAsync },
  async ({ draftEmail, user }): Promise<api.ValidationResult> => {
    if (draftEmail === user?.email) {
      return {
        isValid: true,
      };
    }

    return await api.validateUserEmailFx(draftEmail);
  },
);

export const isDraftChangedAsync = asyncCombine(
  {
    userAsync,
    draftNameAsync,
    draftEmailAsync,
  },
  ({ draftEmail, draftName, user }) =>
    draftName !== user.name || draftEmail !== user.email,
);

export const isDraftReadyToSaveAsync = asyncCombine(
  {
    isSaving: api.updateUserFx.pending,
    isDraftChangedAsync,
    draftNameValidationAsync,
    draftEmailValidationAsync,
  },
  ({ isSaving, isDraftChanged, draftEmailValidation, draftNameValidation }) => {
    const isValid = draftNameValidation.isValid && draftEmailValidation.isValid;
    return !isSaving && isDraftChanged && isValid;
  },
);

export const saveButtonClicked = createEvent();

sample({
  clock: saveButtonClicked,
  source: {
    name: draftNameAsync.$data,
    email: draftEmailAsync.$data,
  },
  filter: (user): user is api.User => !!user.name && !!user.email,
  target: api.updateUserFx,
});

sample({
  clock: api.updateUserFx.doneData,
  target: userAsync.changeData,
});
