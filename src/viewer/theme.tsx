import { createContext, useContext } from "react";

export interface ViewerTheme {
	dark: boolean;
}

const ThemeContext = createContext<ViewerTheme>({ dark: false });

export const ViewerThemeProvider = ThemeContext.Provider;

export function useViewerTheme(): ViewerTheme {
	return useContext(ThemeContext);
}
