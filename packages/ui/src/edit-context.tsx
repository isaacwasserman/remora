import { createContext, useContext } from "react";

interface EditContextValue {
    isEditing: boolean;
    onDeleteStep: (stepId: string) => void;
    onDisconnectStep: (
        sourceId: string,
        targetId: string,
        branchIndex?: number,
    ) => void;
    onSelectStepForEditing: (stepId: string) => void;
    availableToolNames: string[];
    allStepIds: string[];
}

export const EditContext = createContext<EditContextValue>({
    isEditing: false,
    onDeleteStep: () => {},
    onDisconnectStep: () => {},
    onSelectStepForEditing: () => {},
    availableToolNames: [],
    allStepIds: [],
});

export function useEditContext() {
    return useContext(EditContext);
}
