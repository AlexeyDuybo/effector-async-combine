import { useState, type FC } from "react";
import { PaginationPage } from "./pagination/ui";
import { InfiniteScrollExtansionPage } from "./infinite-scroll-extension/ui";
import { FormWithValidationPage } from "./form-with-validation/ui";

import { PaginationPage as PaginationConfigured } from "./with-run-configured/pagination/ui";
import { InfiniteScrollExtansionPage as InfiniteScrollExtansionPageConfigured } from "./with-run-configured/infinite-scroll-extension/ui";
import { FormWithValidationPage as FormWithValidationPageConfigured } from "./with-run-configured/form-with-validation/ui";

import { PaginationPage as PaginationComposition } from "./with-run-composition/pagination/ui";
import { InfiniteScrollExtansionPage as InfiniteScrollExtansionPageComposition } from "./with-run-composition/infinite-scroll-extension/ui";
import { FormWithValidationPage as FormWithValidationPageComposition } from "./with-run-composition/form-with-validation/ui";

import { PaginationPage as PaginationPageWithView } from "./with-view/pagination/ui";
import { InfiniteScrollExtansionPage as InfiniteScrollExtansionPageWithView } from "./with-view/infinite-scroll-extension/ui";
import { FormWithValidationPage as FormWithValidationPageWithView } from "./with-view/form-with-validation/ui";

type Example =
  | "pagination"
  | "infinite-scroll-extension"
  | "form-with-validation"

export const App: FC = () => {
  const [openedExample, setOpenedExample] = useState<Example>(
    "form-with-validation",
  );

  const [exampleType, setExampleType] = useState<
    "default" | "withRun configured" | "withRun composed" | 'with View'
  >("default");

  const Pagination = {
    default: PaginationPage,
    "withRun configured": PaginationConfigured,
    "withRun composed": PaginationComposition,
    "with View": PaginationPageWithView,
  }[exampleType];

  const InfiniteScrollExtansion = {
    default: InfiniteScrollExtansionPage,
    "withRun configured": InfiniteScrollExtansionPageConfigured,
    "withRun composed": InfiniteScrollExtansionPageComposition,
    "with View": InfiniteScrollExtansionPageWithView,
  }[exampleType];

  const FormWithValidation = {
    default: FormWithValidationPage,
    "withRun configured": FormWithValidationPageConfigured,
    "withRun composed": FormWithValidationPageComposition,
    "with View": FormWithValidationPageWithView,
  }[exampleType];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setOpenedExample("pagination")}>
          Pagination
        </button>
        <button onClick={() => setOpenedExample("infinite-scroll-extension")}>
          Infinite scroll extension
        </button>
        <button onClick={() => setOpenedExample("form-with-validation")}>
          Form with validation
        </button>
        <select
          onChange={(e) => {
            // eslint-disable-next-line
            setExampleType(e.target.value as any);
          }}
        >
          <option>default</option>
          <option>withRun configured</option>
          <option>withRun composed</option>
          <option>with View</option>
        </select>
      </div>
      {openedExample === "pagination" && (
        <div>
          <h1>Pagination example</h1>
          <Pagination />
        </div>
      )}
      {openedExample === "infinite-scroll-extension" && (
        <div>
          <h1>Infinite scroll extension example</h1>
          <InfiniteScrollExtansion />
        </div>
      )}
      {openedExample === "form-with-validation" && (
        <div>
          <h1>Form with validation example</h1>
          <FormWithValidation />
        </div>
      )}
    </div>
  );
};
