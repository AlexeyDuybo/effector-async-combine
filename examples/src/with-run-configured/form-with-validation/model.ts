import { createEvent, sample } from "effector";
import { asyncCombine } from "../config";
import * as api from "./api";
import { createGate } from "effector-react";

export const pageGate = createGate();

export const userAsync = asyncCombine(
  pageGate.status,
  async (isPageOpen, { run }) => {
    if (!isPageOpen) throw undefined;
    return await run(api.getUser());
  },
);

export const draftNameAsync = asyncCombine(userAsync, (user) => {
  return user.name;
});

export const draftEmailAsync = asyncCombine(userAsync, (user) => {
  return user.email;
});

export const draftNameValidationAsync = asyncCombine(
  { draftNameAsync, userAsync },
  async ({ draftName, user }, { run }): Promise<api.ValidationResult> => {
    if (draftName === user?.name)
      return {
        isValid: true,
      };
    return await run(api.validateUserName(draftName));
  },
);

export const draftEmailValidationAsync = asyncCombine(
  { draftEmailAsync, userAsync },
  async ({ draftEmail, user }, { run }): Promise<api.ValidationResult> => {
    if (draftEmail === user?.email) {
      return {
        isValid: true,
      };
    }

    return await run(api.validateUserEmail(draftEmail));
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
