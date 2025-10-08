import { useState, type FC } from "react";
import { useGate, useUnit } from "effector-react";
import {
  draftNameValidationAsync,
  draftEmailValidationAsync,
  draftEmailAsync,
  draftNameAsync,
  isDraftReadyToSaveAsync,
  isDraftChangedAsync,
  saveButtonClicked,
  pageGate,
  userAsync,
} from "./model";
import type { AsyncCombine } from "../../../../src";
import type { ValidationResult } from "./api";

export const FormWithValidationPage: FC = () => {
  useGate(pageGate);

  const [isButtonHovered, setIsButtonHovered] = useState(false);

  const showLoader = useUnit(userAsync.$isPending);
  const showErrorMessage = useUnit(userAsync.$isError);
  const isDraftChangedState = useUnit(isDraftChangedAsync.$state);

  const isDraftReadyToSaveState = useUnit(isDraftReadyToSaveAsync.$state);

  const onSaveButtonClick = useUnit(saveButtonClicked);

  if (showLoader) {
    return <p>Form loading...</p>;
  }

  if (showErrorMessage) {
    return <p>Ooops something went wrong</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Input
        placeholder="email"
        valueAsync={draftEmailAsync}
        valueValidationAsync={draftEmailValidationAsync}
      />
      <Input
        placeholder="name"
        valueAsync={draftNameAsync}
        valueValidationAsync={draftNameValidationAsync}
      />
      <div
        style={{ position: "relative", display: "inline-block" }}
        onMouseEnter={() => setIsButtonHovered(true)}
        onMouseLeave={() => setIsButtonHovered(false)}
      >
        <button
          disabled={
            isDraftReadyToSaveState?.isReady
              ? !isDraftReadyToSaveState.data
              : true
          }
          onClick={onSaveButtonClick}
        >
          Save
        </button>
        {isButtonHovered &&
          isDraftChangedState?.isReady &&
          !isDraftChangedState.data && (
            <div
              style={{
                position: "absolute",
                top: -30,
                background: "white",
                borderRadius: 8,
                padding: 6,
              }}
            >
              No changes
            </div>
          )}
      </div>
    </div>
  );
};

const Input: FC<{
  placeholder?: string;
  valueAsync: AsyncCombine<string>;
  valueValidationAsync: AsyncCombine<ValidationResult>;
}> = ({ placeholder, valueAsync, valueValidationAsync }) => {
  const value = useUnit(valueAsync.$data);
  const onValueChange = useUnit(valueAsync.changeData);
  const validationState = useUnit(valueValidationAsync.$state);

  return (
    <div style={{ height: 30 }}>
      <input
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {validationState?.isPending && <div>Validating...</div>}
      {!!validationState?.isReady && !validationState.data.isValid && (
        <div>Error: {validationState.data.message}</div>
      )}
    </div>
  );
};
